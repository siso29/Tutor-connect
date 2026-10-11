require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seed() {
  const client = await pool.connect();
  console.log('[Seed] Starting database seed...');

  try {
    await client.query('BEGIN');

    // Clean existing seed data safely if needed
    console.log('[Seed] Cleaning existing data...');
    await client.query('DELETE FROM reviews');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM tutor_profiles');
    await client.query('DELETE FROM users');

    // Reset sequences
    await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE bookings_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE reviews_id_seq RESTART WITH 1');

    const defaultPassword = await bcrypt.hash('Password123!', 12);

    console.log('[Seed] Inserting users...');
    // 1. Admin
    const adminRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['System Administrator', 'admin@tutorconnect.com', defaultPassword, 'admin']
    );

    // 2. Tutors
    const tutor1Res = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Dr. Sarah Connor', 'sarah.math@example.com', defaultPassword, 'tutor']
    );
    const tutor1Id = tutor1Res.rows[0].id;

    const tutor2Res = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['David Miller', 'david.physics@example.com', defaultPassword, 'tutor']
    );
    const tutor2Id = tutor2Res.rows[0].id;

    const tutor3Res = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Elena Gomez', 'elena.spanish@example.com', defaultPassword, 'tutor']
    );
    const tutor3Id = tutor3Res.rows[0].id;

    // 3. Students
    const student1Res = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Alex Johnson', 'alex.student@example.com', defaultPassword, 'student']
    );
    const student1Id = student1Res.rows[0].id;

    const student2Res = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Maria Garcia', 'maria.student@example.com', defaultPassword, 'student']
    );
    const student2Id = student2Res.rows[0].id;

    console.log('[Seed] Inserting tutor profiles...');
    await client.query(
      `INSERT INTO tutor_profiles (user_id, bio, qualifications, subjects, grade_levels, hourly_rate, location)
       VALUES 
       ($1, $2, $3, $4, $5, $6, $7),
       ($8, $9, $10, $11, $12, $13, $14),
       ($15, $16, $17, $18, $19, $20, $21)`,
      [
        tutor1Id,
        'Passionate Mathematics educator with 7+ years of experience helping students excel in AP Calculus and SAT Math.',
        'Ph.D. in Applied Mathematics, Certified AP Teacher',
        ['Calculus', 'Algebra', 'Geometry', 'Statistics'],
        [8, 9, 10, 11, 12],
        45.00,
        'New York, NY',

        tutor2Id,
        'Physics & Chemistry specialist focused on hands-on conceptual understanding and exam preparation.',
        'M.S. in Physics, former university TA',
        ['Physics', 'Chemistry', 'General Science'],
        [9, 10, 11, 12],
        50.00,
        'San Francisco, CA',

        tutor3Id,
        'Native Spanish speaker providing tailored immersion and conversational practice for all levels.',
        'B.A. in Spanish Literature, Certified DELE Examiner',
        ['Spanish', 'Literature', 'Writing'],
        [6, 7, 8, 9, 10, 11, 12],
        35.00,
        'Austin, TX'
      ]
    );

    console.log('[Seed] Inserting sample bookings...');
    const now = new Date();
    const pastDate1 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const pastDate2 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const futureDate1 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const futureDate2 = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const b1Res = await client.query(
      `INSERT INTO bookings (student_id, tutor_id, lesson_date, duration_minutes, message, status)
       VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id`,
      [student1Id, tutor1Id, pastDate1.toISOString(), 60, 'Need help with AP Calculus Derivatives']
    );
    const booking1Id = b1Res.rows[0].id;

    await client.query(
      `INSERT INTO bookings (student_id, tutor_id, lesson_date, duration_minutes, message, status)
       VALUES ($1, $2, $3, $4, $5, 'accepted')`,
      [student1Id, tutor2Id, futureDate1.toISOString(), 90, 'Preparing for midterm mechanics exam']
    );

    const b3Res = await client.query(
      `INSERT INTO bookings (student_id, tutor_id, lesson_date, duration_minutes, message, status)
       VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id`,
      [student2Id, tutor3Id, pastDate2.toISOString(), 60, 'Conversational Spanish practice session']
    );
    const booking3Id = b3Res.rows[0].id;

    await client.query(
      `INSERT INTO bookings (student_id, tutor_id, lesson_date, duration_minutes, message, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [student2Id, tutor1Id, futureDate2.toISOString(), 60, 'Reviewing quadratic equations and factoring']
    );

    console.log('[Seed] Inserting sample reviews...');
    await client.query(
      `INSERT INTO reviews (booking_id, student_id, tutor_id, rating, comment)
       VALUES 
       ($1, $2, $3, 5, 'Dr. Sarah explained derivatives step-by-step! Best calculus tutor ever.'),
       ($4, $5, $6, 5, 'Elena is an amazing Spanish teacher! Super friendly and encouraging.')`,
      [booking1Id, student1Id, tutor1Id, booking3Id, student2Id, tutor3Id]
    );

    await client.query('COMMIT');
    console.log('[Seed] Database seeding completed successfully!');
    console.log('\n--- Seed Accounts Summary ---');
    console.log('Password for all users: Password123!');
    console.log('Admin:   admin@tutorconnect.com');
    console.log('Tutors:  sarah.math@example.com, david.physics@example.com, elena.spanish@example.com');
    console.log('Students: alex.student@example.com, maria.student@example.com\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Seed Error] Failed to seed database:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch(() => process.exit(1));
}

module.exports = seed;
