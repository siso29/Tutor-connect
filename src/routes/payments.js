const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const CHAPA_BASE_URL = 'https://api.chapa.global/v2';
const COMMISSION_RATE = Math.min(30, Math.max(0, Number(process.env.PLATFORM_COMMISSION_PERCENT || 10)));

function safeName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || 'TutorConnect', last_name: parts.slice(1).join(' ') || 'Customer' };
}

async function chapaRequest(path, options = {}) {
  if (!process.env.CHAPA_SECRET_KEY) {
    const error = new Error('Chapa is not configured. Add CHAPA_SECRET_KEY to the backend .env file.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${CHAPA_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'failed' || data.status === 'error') {
    console.error('Chapa API error:', response.status, data.message || 'request failed');
    const error = new Error('Payment provider could not process the request. Please try again.');
    error.status = 502;
    throw error;
  }
  return data;
}

function statusFromProvider(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'success' || value === 'successful') return 'successful';
  if (value === 'failed' || value === 'blocked') return 'failed';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  if (value.includes('refund')) return 'refunded';
  return 'pending';
}

async function markPaymentResult(client, payment, providerData) {
  const newStatus = statusFromProvider(providerData.status);
  const providerAmount = Number(providerData.amount);
  const amountMatches = Number.isFinite(providerAmount) && Math.abs(providerAmount - Number(payment.amount)) < 0.01;
  const currencyMatches = String(providerData.currency || '').toUpperCase() === payment.currency;
  const verifiedSuccess = newStatus === 'successful' && amountMatches && currencyMatches;
  const finalStatus = newStatus === 'successful' && !verifiedSuccess ? 'failed' : newStatus;

  await client.query('BEGIN');
  try {
    const update = await client.query(
      `UPDATE payments SET status=$1, chapa_reference=COALESCE($2,chapa_reference),
       payment_method=COALESCE($3,payment_method), provider_payload=$4::jsonb,
       verified_at=CASE WHEN $5 THEN NOW() ELSE verified_at END, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [finalStatus, providerData.chapa_reference || providerData.reference || null,
       providerData.payment_method || null, JSON.stringify(providerData), verifiedSuccess, payment.id]
    );
    if (verifiedSuccess) {
      await client.query("UPDATE bookings SET payment_status='paid' WHERE id=$1", [payment.booking_id]);
      await client.query(
        `INSERT INTO notifications(user_id,type,title,body,link)
         VALUES ($1,'payment','Payment received','Your lesson payment was verified successfully.','/guardian-dashboard')`,
        [payment.student_id]
      );
      await client.query(
        `INSERT INTO notifications(user_id,type,title,body,link)
         VALUES ($1,'payment','Lesson payment received','A student payment for your lesson has been verified.','/tutor-dashboard')`,
        [payment.tutor_id]
      );
    } else if (['failed','cancelled','refunded'].includes(finalStatus)) {
      await client.query('UPDATE bookings SET payment_status=$1 WHERE id=$2', [finalStatus, payment.booking_id]);
    }
    await client.query('COMMIT');
    return update.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// Create a Chapa hosted-checkout session for a booking owned by the signed-in user.
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    if (!['student','guardian','learner'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only student/guardian accounts can pay for lessons.' });
    }
    const bookingId = Number(req.body.bookingId);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({ error: 'A valid bookingId is required.' });
    }
    const bookingResult = await pool.query(
      `SELECT b.id,b.student_id,b.tutor_id,b.total,b.price,b.duration_minutes,b.status,b.payment_status,
              s.full_name AS student_name,s.email AS student_email,s.phone AS student_phone,
              t.full_name AS tutor_name,tp.hourly_rate
       FROM bookings b JOIN users s ON s.id=b.student_id JOIN users t ON t.id=b.tutor_id LEFT JOIN tutor_profiles tp ON tp.user_id=t.id
       WHERE b.id=$1 AND b.student_id=$2`, [bookingId, req.user.id]
    );
    if (!bookingResult.rows.length) return res.status(404).json({ error: 'Booking not found for this account.' });
    const booking = bookingResult.rows[0];
    if (String(booking.payment_status).toLowerCase() === 'paid') {
      return res.status(409).json({ error: 'This booking has already been paid.' });
    }
    if (['Declined','Cancelled','cancelled','rejected'].includes(booking.status)) {
      return res.status(409).json({ error: 'Cancelled or declined bookings cannot be paid.' });
    }
    const durationMinutes = Number(booking.duration_minutes || 60);
    const hourlyRate = Number(booking.hourly_rate);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 240) return res.status(400).json({ error: 'Lesson duration must be between 30 and 240 minutes.' });
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return res.status(400).json({ error: 'Tutor hourly rate is not configured.' });
    // Never trust a price submitted by the browser. Calculate from the stored tutor rate.
    const amount = Math.round((hourlyRate * durationMinutes / 60) * 100) / 100;
    const commission = Math.round(amount * COMMISSION_RATE) / 100;
    const reference = `TC-${booking.id}-${crypto.randomUUID().replace(/-/g,'').slice(0,16)}`;
    const customerName = safeName(booking.student_name);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const inserted = await pool.query(
      `INSERT INTO payments(booking_id,student_id,tutor_id,merchant_reference,amount,currency,platform_commission,tutor_earnings)
       VALUES($1,$2,$3,$4,$5,'ETB',$6,$7) RETURNING id`,
      [booking.id, booking.student_id, booking.tutor_id, reference, amount, commission, Math.max(0, amount-commission)]
    );
    try {
      const response = await chapaRequest('/payments/hosted', {
        method: 'POST',
        body: JSON.stringify({
          amount: amount.toFixed(2), currency: 'ETB', merchant_reference: reference,
          return_url: `${baseUrl}/payment-result?tx_ref=${encodeURIComponent(reference)}`,
          customer: {
            ...customerName, email: booking.student_email,
            ...(booking.student_phone ? { phone_number: booking.student_phone } : {})
          },
          meta: { booking_id: booking.id, payment_id: inserted.rows[0].id, platform: 'Tutor Connect' }
        })
      });
      const providerData = response.data || {};
      const checkoutUrl = providerData.checkout_url;
      if (!checkoutUrl || !/^https:\/\/(checkout\.chapa\.global|checkout\.chapa\.co)\//i.test(checkoutUrl)) {
        throw Object.assign(new Error('Chapa did not return a valid checkout URL.'), { status: 502 });
      }
      await pool.query('UPDATE payments SET checkout_url=$1,chapa_reference=$2,provider_payload=$3::jsonb,updated_at=NOW() WHERE id=$4',
        [checkoutUrl, providerData.reference || providerData.chapa_reference || null, JSON.stringify(providerData), inserted.rows[0].id]);
      res.status(201).json({ checkoutUrl, reference, paymentId: inserted.rows[0].id, amount, currency: 'ETB' });
    } catch (error) {
      await pool.query("UPDATE payments SET status='failed',updated_at=NOW() WHERE id=$1", [inserted.rows[0].id]);
      throw error;
    }
  } catch (error) { next(error); }
});

// User returns here after hosted checkout; verify directly with Chapa on the server.
router.post('/verify/:reference', authenticate, async (req, res, next) => {
  try {
    const found = await pool.query(
      `SELECT * FROM payments WHERE merchant_reference=$1 AND (student_id=$2 OR tutor_id=$2 OR $3='admin')`,
      [req.params.reference, req.user.id, req.user.role]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'Payment not found.' });
    const payment = found.rows[0];
    if (payment.status === 'successful') return res.json({ status: 'successful', payment });
    const verifyReference = payment.chapa_reference || payment.merchant_reference;
    const response = await chapaRequest(`/payments/${encodeURIComponent(verifyReference)}/verify`, { method: 'GET' });
    const providerData = response.data || {};
    const client = await pool.connect();
    let updated;
    try { updated = await markPaymentResult(client, payment, providerData); }
    finally { client.release(); }
    res.json({ status: updated.status, payment: updated });
  } catch (error) { next(error); }
});

router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id,p.booking_id,p.merchant_reference,p.amount,p.currency,p.platform_commission,p.tutor_earnings,p.status,p.payment_method,p.created_at,p.verified_at,
              b.subject,b.lesson_date,t.full_name AS tutor_name,s.full_name AS student_name
       FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN users t ON t.id=p.tutor_id JOIN users s ON s.id=p.student_id
       WHERE p.student_id=$1 OR p.tutor_id=$1 ORDER BY p.created_at DESC LIMIT 100`, [req.user.id]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.get('/admin/summary', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total_payments,
       COUNT(*) FILTER (WHERE status='successful')::int AS successful_payments,
       COUNT(*) FILTER (WHERE status='pending')::int AS pending_payments,
       COALESCE(SUM(amount) FILTER (WHERE status='successful'),0)::numeric(12,2) AS gross_revenue,
       COALESCE(SUM(platform_commission) FILTER (WHERE status='successful'),0)::numeric(12,2) AS platform_commission,
       COALESCE(SUM(tutor_earnings) FILTER (WHERE status='successful'),0)::numeric(12,2) AS tutor_earnings
       FROM payments`
    );
    const payments = await pool.query(
      `SELECT p.*,b.subject,s.full_name AS student_name,t.full_name AS tutor_name
       FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN users s ON s.id=p.student_id JOIN users t ON t.id=p.tutor_id
       ORDER BY p.created_at DESC LIMIT 200`
    );
    res.json({ summary: result.rows[0], payments: payments.rows });
  } catch (error) { next(error); }
});

// Chapa dashboard webhooks should target /api/payments/webhook. Verify raw-body HMAC.
router.post('/webhook', async (req, res, next) => {
  try {
    const secret = process.env.CHAPA_WEBHOOK_SECRET;
    const signature = req.get('x-chapa-signature');
    if (!secret || !req.rawBody || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
      return res.status(401).json({ error: 'Webhook signature configuration or signature is missing.' });
    }
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const a = Buffer.from(signature, 'hex'); const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Invalid webhook signature.' });
    const payload = req.body || {};
    const reference = payload.merchant_reference || payload.data?.merchant_reference;
    const eventName = payload.event || payload.webhook_type || 'payment.update';
    const chapaRef = payload.chapa_reference || payload.data?.chapa_reference || null;
    if (!reference) return res.status(400).json({ error: 'Webhook merchant_reference is missing.' });
    const eventKey = `${eventName}:${reference}:${payload.status || payload.data?.status || 'unknown'}:${payload.updated_at || ''}`;
    const dedupe = await pool.query(
      'INSERT INTO payment_webhook_events(event_key,event_type,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(event_key) DO NOTHING RETURNING id',
      [eventKey, eventName, JSON.stringify(payload)]
    );
    if (!dedupe.rows.length) return res.json({ received: true, duplicate: true });
    const found = await pool.query('SELECT * FROM payments WHERE merchant_reference=$1', [reference]);
    if (!found.rows.length) return res.json({ received: true, ignored: true });
    const payment = found.rows[0];
    const verifyRef = chapaRef || payment.chapa_reference || reference;
    const verified = await chapaRequest(`/payments/${encodeURIComponent(verifyRef)}/verify`, { method: 'GET' });
    const client = await pool.connect();
    try { await markPaymentResult(client, payment, verified.data || {}); }
    finally { client.release(); }
    res.json({ received: true });
  } catch (error) { next(error); }
});

module.exports = router;
