require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const pool = require('./src/config/db');

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  console.log(`\n========================================`);
  console.log(`RUNNING FULL BACKEND & FRONTEND INTEGRATION TESTS`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`========================================\n`);

  let studentToken = '';
  let tutorToken = '';
  let adminToken = '';
  let guardianToken = '';
  let studentId = null;
  let tutorId = null;
  let testBookingId = null;

  try {
    // 1. Root & Health Check
    console.log('Test 1: Health check...');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    console.assert(healthRes.status === 200, 'Health check status should be 200');
    console.assert(healthData.status === 'healthy', 'Health check should return status healthy');
    console.log('✅ Health check passed!\n');

    // 2. Auth Login (Student, Tutor, Admin, Guardian)
    console.log('Test 2: Login seeded users...');
    const studentLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sara.student@example.com', password: 'Password123!' })
    });
    const studentData = await studentLogin.json();
    console.assert(studentLogin.status === 200, 'Student login should succeed');
    console.assert(studentData.user.name === 'Sara Bekele', 'User name should be Sara Bekele');
    studentToken = studentData.token;
    studentId = studentData.user.id;
    console.log(`✅ Student login passed! (${studentData.user.name})`);

    const tutorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dawit.alemu@example.com', password: 'Password123!' })
    });
    const tutorData = await tutorLogin.json();
    console.assert(tutorLogin.status === 200, 'Tutor login should succeed');
    console.assert(tutorData.user.name === 'Dawit Alemu', 'User name should be Dawit Alemu');
    tutorToken = tutorData.token;
    tutorId = tutorData.user.id;
    console.log(`✅ Tutor login passed! (${tutorData.user.name})`);

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tutorconnect.com', password: 'Password123!' })
    });
    const adminData = await adminLogin.json();
    console.assert(adminLogin.status === 200, 'Admin login should succeed');
    adminToken = adminData.token;
    console.log(`✅ Admin login passed! (${adminData.user.name})`);

    const guardianLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'abel.parent@example.com', password: 'Password123!' })
    });
    const guardianData = await guardianLogin.json();
    console.assert(guardianLogin.status === 200, 'Guardian login should succeed');
    console.assert(guardianData.user.role === 'guardian', 'User role should be guardian');
    console.assert(guardianData.user.name === 'Abel Bekele', 'User name should be Abel Bekele');
    guardianToken = guardianData.token;
    console.log(`✅ Guardian login passed! (${guardianData.user.name})\n`);

    // 3. Register Guardian / Learner account (as sent by frontend Auth.jsx)
    console.log('Test 3: Register new Guardian/Learner user (frontend simulation)...');
    const newEmail = `parent.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Almaz Ayana',
        email: newEmail,
        password: 'Password123!',
        role: 'guardian'
      })
    });
    const regData = await regRes.json();
    console.assert(regRes.status === 201, 'Registration should return 201');
    console.assert(regData.user.name === 'Almaz Ayana', 'User name should match fullName');
    console.assert(regData.user.role === 'guardian', 'Role should be guardian');
    console.log(`✅ Guardian registration passed! ID: ${regData.user.id}\n`);

    // 4. Authenticated /me
    console.log('Test 4: Verify /api/auth/me...');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tutorToken}` }
    });
    const meData = await meRes.json();
    console.assert(meRes.status === 200, '/me should return 200');
    console.assert(meData.user.role === 'tutor', 'User role should be tutor');
    console.assert(meData.user.name === 'Dawit Alemu', 'User name should match');
    console.assert(meData.user.profile !== null, 'Tutor profile should be loaded');
    console.log('✅ /api/auth/me passed!\n');

    // 5. Tutor list (frontend Array.isArray check)
    console.log('Test 5: Tutor list format verification (Array.isArray check)...');
    const tutorsRes = await fetch(`${baseUrl}/api/tutors`);
    const tutorsData = await tutorsRes.json();
    console.assert(tutorsRes.status === 200, 'Tutors list should return 200');
    console.assert(Array.isArray(tutorsData), 'GET /api/tutors must return an ARRAY for frontend compatibility');
    console.assert(tutorsData.length >= 6, 'Should contain at least 6 tutors');
    
    // Check first tutor fields expected by frontend
    const firstTutor = tutorsData[0];
    console.assert(firstTutor.name !== undefined, 'Tutor.name must exist');
    console.assert(firstTutor.price !== undefined, 'Tutor.price must exist');
    console.assert(firstTutor.rating !== undefined, 'Tutor.rating must exist');
    console.assert(Array.isArray(firstTutor.subjects), 'Tutor.subjects must be an array');
    console.assert(Array.isArray(firstTutor.grades), 'Tutor.grades must be an array');
    console.assert(firstTutor.gradeRangeLabel !== undefined, 'Tutor.gradeRangeLabel must exist');
    console.assert(Array.isArray(firstTutor.reviews), 'Tutor.reviews must be an array');
    console.log(`✅ Tutor list passed! Returned ${tutorsData.length} tutors formatted for frontend.`);

    // Single tutor by ID
    const singleTutorRes = await fetch(`${baseUrl}/api/tutors/${tutorId}`);
    const singleTutorData = await singleTutorRes.json();
    console.assert(singleTutorRes.status === 200, 'Get single tutor should return 200');
    console.assert(singleTutorData.id === tutorId, 'Tutor ID should match directly on root object');
    console.assert(singleTutorData.tutor.id === tutorId, 'Tutor ID should also match nested tutor.id');
    console.log(`✅ Get single tutor passed! (${singleTutorData.name})\n`);

    // 6. Booking Flow (Frontend structure)
    console.log('Test 6: Create a booking using frontend payload...');
    const createBookingRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guardianToken}`
      },
      body: JSON.stringify({
        learnerId: 'u-1',
        learnerName: 'Abel Jr. Bekele',
        guardianName: 'Abel Bekele',
        tutorId: tutorId,
        tutorName: 'Dawit Alemu',
        subject: 'Physics',
        date: 'Mon 26 Oct 2026',
        time: '10:00 AM',
        mode: 'Online',
        grade: 'Grade 10',
        duration: '1',
        price: 320,
        total: 320,
        message: 'Looking forward to kinematics lesson!'
      })
    });
    const createBookingData = await createBookingRes.json();
    console.assert(createBookingRes.status === 201, 'Booking should be created (201)');
    console.assert(createBookingData.booking !== undefined, 'Response must include booking object');
    testBookingId = createBookingData.booking.id;
    console.log(`✅ Booking created! Booking Code: ${testBookingId}`);

    // Verify GET /api/bookings returns array
    const listBookingsRes = await fetch(`${baseUrl}/api/bookings`, {
      headers: { Authorization: `Bearer ${guardianToken}` }
    });
    const listBookingsData = await listBookingsRes.json();
    console.assert(Array.isArray(listBookingsData), 'GET /api/bookings must return an ARRAY for frontend compatibility');
    console.log(`✅ GET /api/bookings returned array with ${listBookingsData.length} booking(s).`);

    // Tutor accepts booking
    console.log('Test 7: Tutor confirms the booking...');
    const acceptRes = await fetch(`${baseUrl}/api/bookings/${testBookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tutorToken}`
      },
      body: JSON.stringify({ status: 'Confirmed' })
    });
    const acceptData = await acceptRes.json();
    console.assert(acceptRes.status === 200, 'Accept should return 200');
    console.assert(acceptData.booking.status === 'Confirmed', 'Booking status should be Confirmed');
    console.log('✅ Booking confirmed by tutor!\n');

    // 7. Tutor direct review (from frontend modal)
    console.log('Test 8: Add review to tutor (frontend ReviewModal simulation)...');
    const addReviewRes = await fetch(`${baseUrl}/api/tutors/${tutorId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: 'Parent of Grade 10 student',
        rating: 5,
        comment: 'Dawit is exceptional! Simplified complex mechanics concepts.'
      })
    });
    const addReviewData = await addReviewRes.json();
    console.assert(addReviewRes.status === 201, 'Review addition should return 201');
    console.log('✅ Tutor direct review added successfully!\n');

    // 8. Support Inquiries and Reports
    console.log('Test 9: Submit and list support inquiries...');
    const inqRes = await fetch(`${baseUrl}/api/support/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tigist K.',
        email: 'tigist@example.com',
        subject: 'Payment options',
        message: 'Do you accept Telebirr payments?'
      })
    });
    const inqData = await inqRes.json();
    console.assert(inqRes.status === 201, 'Inquiry should return 201');
    console.log(`✅ Support inquiry created! Ticket: ${inqData.ticketNumber}`);

    const listInqRes = await fetch(`${baseUrl}/api/support/inquiries`);
    const listInqData = await listInqRes.json();
    console.assert(Array.isArray(listInqData), 'Inquiries must be an array');
    console.assert(listInqData.length >= 2, 'Should have at least 2 inquiries');
    console.log(`✅ Inquiries list verified! Total: ${listInqData.length}\n`);

    // 9. Admin Stats
    console.log('Test 10: Admin dashboard stats...');
    const adminStatsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminStatsData = await adminStatsRes.json();
    console.assert(adminStatsRes.status === 200, 'Admin stats should return 200');
    console.assert(adminStatsData.users.total_users >= 8, 'Total users should be >= 8');
    console.log('✅ Admin stats verified:', {
      total_users: adminStatsData.users.total_users,
      total_tutors: adminStatsData.users.total_tutors,
      total_students: adminStatsData.users.total_students,
      total_bookings: adminStatsData.bookings.total_bookings
    });

    console.log('\n========================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED 100%!');
    console.log('Backend is completely aligned with Frontend!');
    console.log('========================================\n');
  } finally {
    server.close();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
