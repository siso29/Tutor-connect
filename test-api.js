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
  console.log(`RUNNING END-TO-END BACKEND API TESTS`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`========================================\n`);

  let studentToken = '';
  let tutorToken = '';
  let adminToken = '';
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

    // 2. Auth Login (Student, Tutor, Admin)
    console.log('Test 2: Login seeded users...');
    const studentLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex.student@example.com', password: 'Password123!' })
    });
    const studentData = await studentLogin.json();
    console.assert(studentLogin.status === 200, 'Student login should succeed');
    studentToken = studentData.token;
    studentId = studentData.user.id;
    console.log('✅ Student login passed!');

    const tutorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah.math@example.com', password: 'Password123!' })
    });
    const tutorData = await tutorLogin.json();
    console.assert(tutorLogin.status === 200, 'Tutor login should succeed');
    tutorToken = tutorData.token;
    tutorId = tutorData.user.id;
    console.log('✅ Tutor login passed!');

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tutorconnect.com', password: 'Password123!' })
    });
    const adminData = await adminLogin.json();
    console.assert(adminLogin.status === 200, 'Admin login should succeed');
    adminToken = adminData.token;
    console.log('✅ Admin login passed!\n');

    // 3. Authenticated /me
    console.log('Test 3: Verify /api/auth/me...');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tutorToken}` }
    });
    const meData = await meRes.json();
    console.assert(meRes.status === 200, '/me should return 200');
    console.assert(meData.user.role === 'tutor', 'User role should be tutor');
    console.assert(meData.user.profile !== null, 'Tutor profile should be loaded');
    console.log('✅ /api/auth/me passed!\n');

    // 4. Tutor Search and Filtering
    console.log('Test 4: Tutor search & filter...');
    const searchRes = await fetch(`${baseUrl}/api/tutors?subject=Calculus`);
    const searchData = await searchRes.json();
    console.assert(searchRes.status === 200, 'Tutor search should return 200');
    console.assert(searchData.tutors.length >= 1, 'Should find at least 1 calculus tutor');
    console.log(`✅ Tutor search passed! Found ${searchData.tutors.length} Calculus tutor(s).`);

    const singleTutorRes = await fetch(`${baseUrl}/api/tutors/${tutorId}`);
    const singleTutorData = await singleTutorRes.json();
    console.assert(singleTutorRes.status === 200, 'Get single tutor should return 200');
    console.assert(singleTutorData.tutor.id === tutorId, 'Tutor ID should match');
    console.log('✅ Get single tutor passed!\n');

    // 5. Booking Flow
    console.log('Test 5: Create a new booking...');
    const lessonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const createBookingRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        tutorId: tutorId,
        lessonDate: lessonDate,
        durationMinutes: 60,
        message: 'Looking forward to our lesson!'
      })
    });
    const createBookingData = await createBookingRes.json();
    console.assert(createBookingRes.status === 201, 'Booking should be created (201)');
    testBookingId = createBookingData.booking.id;
    console.log(`✅ Booking created! ID: ${testBookingId}`);

    console.log('Test 6: Tutor accepts the booking...');
    const acceptRes = await fetch(`${baseUrl}/api/bookings/${testBookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tutorToken}`
      },
      body: JSON.stringify({ status: 'accepted' })
    });
    const acceptData = await acceptRes.json();
    console.assert(acceptRes.status === 200, 'Accept should return 200');
    console.assert(acceptData.booking.status === 'accepted', 'Booking status should be accepted');
    console.log('✅ Booking accepted!');

    console.log('Test 7: Tutor marks booking as completed...');
    const completeRes = await fetch(`${baseUrl}/api/bookings/${testBookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tutorToken}`
      },
      body: JSON.stringify({ status: 'completed' })
    });
    const completeData = await completeRes.json();
    console.assert(completeRes.status === 200, 'Complete should return 200');
    console.assert(completeData.booking.status === 'completed', 'Booking status should be completed');
    console.log('✅ Booking completed!\n');

    // 6. Review Submission
    console.log('Test 8: Student submits review...');
    const reviewRes = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        bookingId: testBookingId,
        rating: 5,
        comment: 'Great calculus session! Very patient.'
      })
    });
    const reviewData = await reviewRes.json();
    console.assert(reviewRes.status === 201, 'Review submission should return 201');
    console.log('✅ Review submitted successfully!');

    const tutorReviewsRes = await fetch(`${baseUrl}/api/reviews/tutor/${tutorId}`);
    const tutorReviewsData = await tutorReviewsRes.json();
    console.assert(tutorReviewsRes.status === 200, 'Tutor reviews should return 200');
    console.assert(tutorReviewsData.stats.total_reviews >= 2, 'Total reviews should include new review');
    console.log(`✅ Tutor reviews list verified! Total reviews: ${tutorReviewsData.stats.total_reviews}\n`);

    // 7. Admin Metrics & Operations
    console.log('Test 9: Admin dashboard stats...');
    const adminStatsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminStatsData = await adminStatsRes.json();
    console.assert(adminStatsRes.status === 200, 'Admin stats should return 200');
    console.assert(adminStatsData.users.total_users >= 6, 'Total users should be >= 6');
    console.log('✅ Admin stats verified:', adminStatsData.users);

    console.log('\n========================================');
    console.log('🎉 ALL BACKEND API TESTS PASSED SUCCESSFULLY!');
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
