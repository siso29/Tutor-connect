require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seed() {
  const client = await pool.connect();
  console.log('[Seed] Starting database migration & seed...');

  try {
    await client.query('BEGIN');

    console.log('[Seed] Rebuilding schema...');
    // Drop existing tables to refresh constraints
    await client.query(`
      DROP TABLE IF EXISTS reviews CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS tutor_profiles CASCADE;
      DROP TABLE IF EXISTS inquiries CASCADE;
      DROP TABLE IF EXISTS reports CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Read and run schema.sql
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await client.query(schemaSql);

    const defaultPassword = await bcrypt.hash('Password123!', 12);

    console.log('[Seed] Inserting users & tutors...');

    // 1. Tutors (IDs 1 to 6 to match frontend mock data perfectly)
    const tutorsData = [
      {
        id: 1,
        name: 'Hanna Tesfaye',
        email: 'hanna.tesfaye@example.com',
        subjects: ['Mathematics'],
        grades: [6, 7, 8, 9, 10],
        modes: ['Online', 'In-person'],
        price: 250,
        experience: 7,
        availability: 'Sat 10:00',
        availableDays: ['Sat', 'Mon', 'Wed'],
        availableTimes: ['09:00', '10:00', '14:00', '16:00'],
        verified: true,
        verificationStatus: 'Verified',
        description: 'Secondary school mathematics teacher focused on exam confidence and clear step-by-step methods.',
        about: "I teach secondary school mathematics with a focus on understanding over memorising. Each lesson starts with the learner's current level, then builds toward exam confidence with short practice sets and clear feedback.",
        method: 'Step-by-step explanations, worked examples, and a short summary note after each session.',
        qualifications: 'BSc Mathematics (Addis Ababa University), Certified High School Educator, Identity and background verified',
        location: 'Bole, Addis Ababa',
        reviews: [
          { author: 'Guardian of a Grade 8 learner', rating: 5, date: 'Oct 8, 2026', comment: 'Clear, patient and always on time. The explanations were very helpful.' },
          { author: 'Guardian of a Grade 9 learner', rating: 4.8, date: 'Oct 2, 2026', comment: 'Good explanations and helpful notes after each lesson.' }
        ]
      },
      {
        id: 2,
        name: 'Yonas Girma',
        email: 'yonas.girma@example.com',
        subjects: ['Mathematics', 'Physics'],
        grades: [6, 7, 8, 9, 10, 11, 12],
        modes: ['Online'],
        price: 220,
        experience: 4,
        availability: 'Mon 17:00',
        availableDays: ['Mon', 'Tue', 'Thu'],
        availableTimes: ['15:00', '17:00', '18:00'],
        verified: true,
        verificationStatus: 'Verified',
        description: 'Engineering graduate who explains concepts with real examples and practice sets.',
        about: 'I am an engineering graduate who enjoys helping learners understand difficult concepts through practical examples and regular practice.',
        method: 'Real-world examples, guided exercises, and practice questions tailored to each learner.',
        qualifications: 'BSc Civil Engineering, Tutor experience: 4 years, Identity verification reviewed',
        location: 'Kazanchis, Addis Ababa',
        reviews: [
          { author: 'Student in Grade 11', rating: 4.7, date: 'Sep 29, 2026', comment: 'Made Newtonian mechanics simple and fun to understand!' }
        ]
      },
      {
        id: 3,
        name: 'Meseret Kebede',
        email: 'meseret.kebede@example.com',
        subjects: ['Mathematics'],
        grades: [5, 6, 7, 8, 9],
        modes: ['In-person'],
        price: 280,
        experience: 5,
        availability: 'Tue 16:30',
        availableDays: ['Tue', 'Wed', 'Fri'],
        availableTimes: ['14:00', '16:00', '17:00'],
        verified: true,
        verificationStatus: 'Verified',
        description: 'Patient tutor for middle grades, with homework support and weekly progress notes.',
        about: 'I provide patient mathematics tutoring for middle-grade learners, helping them build confidence and strengthen their understanding.',
        method: 'Homework support, worked examples, and weekly progress notes.',
        qualifications: 'BA Mathematics Education, Tutor experience: 5 years, Identity verification reviewed',
        location: 'Megenagna, Addis Ababa',
        reviews: [
          { author: 'Parent of Grade 7 student', rating: 5, date: 'Oct 5, 2026', comment: 'Meseret is very patient and keeps me updated every week on progress.' }
        ]
      },
      {
        id: 4,
        name: 'Biruk Tadesse',
        email: 'biruk.tadesse@example.com',
        subjects: ['Mathematics'],
        grades: [6, 7, 8, 9],
        modes: ['Online'],
        price: 150,
        experience: 1,
        availability: 'Wed 18:00',
        availableDays: ['Wed', 'Fri', 'Sun'],
        availableTimes: ['17:00', '18:00'],
        verified: false,
        verificationStatus: 'Pending',
        description: 'University student offering affordable lessons for Grades 6 to 9.',
        about: 'I offer affordable mathematics lessons for learners who need additional help with classroom topics and practice questions.',
        method: 'Simple explanations and guided practice.',
        qualifications: 'University Student (Computer Science), Tutor experience: 1 year, Identity document submitted for verification',
        location: '4 Kilo, Addis Ababa',
        reviews: [
          { author: 'Grade 8 Learner', rating: 4.5, date: 'Oct 1, 2026', comment: 'Great help before my algebra quiz.' }
        ]
      },
      {
        id: 5,
        name: 'Dawit Alemu',
        email: 'dawit.alemu@example.com',
        subjects: ['Physics', 'Chemistry'],
        grades: [9, 10, 11, 12],
        modes: ['Online', 'Hybrid'],
        price: 320,
        experience: 6,
        availability: 'Thu 15:00',
        availableDays: ['Mon', 'Thu', 'Sat'],
        availableTimes: ['10:00', '15:00', '17:00'],
        verified: true,
        verificationStatus: 'Verified',
        description: 'Science tutor helping students understand difficult topics and prepare for exams.',
        about: 'I help secondary school learners understand physics and chemistry through clear explanations, examples, and exam preparation.',
        method: 'Concept explanations, worked problems, and exam practice.',
        qualifications: 'MSc Chemistry, High School Science Teacher, Identity verification reviewed',
        location: 'Sarbet, Addis Ababa',
        reviews: [
          { author: 'Guardian of Grade 12 student', rating: 5, date: 'Sep 25, 2026', comment: 'Excellent exam preparation. My son felt so much more confident for national tests.' }
        ]
      },
      {
        id: 6,
        name: 'Selam Bekele',
        email: 'selam.bekele@example.com',
        subjects: ['English', 'Amharic'],
        grades: [0, 1, 2, 3, 4, 5, 6],
        modes: ['Online', 'In-person'],
        price: 200,
        experience: 5,
        availability: 'Fri 14:00',
        availableDays: ['Tue', 'Fri', 'Sat'],
        availableTimes: ['11:00', '14:00', '15:00'],
        verified: true,
        verificationStatus: 'Verified',
        description: 'Language tutor specializing in reading, writing and early learning.',
        about: 'I support younger learners as they develop their language, reading, writing, and communication skills.',
        method: 'Reading activities, writing exercises, and age-appropriate learning tasks.',
        qualifications: 'BA Literature & Linguistics, Early Childhood Certified, Identity verification reviewed',
        location: 'CMC, Addis Ababa',
        reviews: [
          { author: 'Parent of Grade 2 learner', rating: 5, date: 'Sep 15, 2026', comment: 'Kind, patient, and keeps reading engaging and fun.' }
        ]
      }
    ];

    for (const t of tutorsData) {
      await client.query(
        `INSERT INTO users (id, full_name, email, password_hash, role, avatar)
         VALUES ($1, $2, $3, $4, 'tutor', $5)`,
        [t.id, t.name, t.email, defaultPassword, t.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()]
      );

      await client.query(
        `INSERT INTO tutor_profiles (
          user_id, bio, qualifications, subjects, grade_levels, hourly_rate, location,
          modes, experience, availability, available_days, available_times,
          verified, verification_status, description, method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          t.id,
          t.about,
          t.qualifications,
          t.subjects,
          t.grades,
          t.price,
          t.location,
          t.modes,
          t.experience,
          t.availability,
          t.availableDays,
          t.availableTimes,
          t.verified,
          t.verificationStatus,
          t.description,
          t.method
        ]
      );

      for (const rev of t.reviews) {
        await client.query(
          `INSERT INTO reviews (tutor_id, rating, comment, author_name)
           VALUES ($1, $2, $3, $4)`,
          [t.id, rev.rating, rev.comment, rev.author]
        );
      }
    }

    // Advance sequence past 6
    await client.query(`SELECT setval('users_id_seq', 6, true)`);

    // 2. Extra Students, Guardians, Admin
    // Guardian: Abel Bekele (id 7)
    const abelRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, avatar, phone)
       VALUES ($1, $2, $3, 'guardian', 'AB', '+251 91 123 4567') RETURNING id`,
      ['Abel Bekele', 'abel.parent@example.com', defaultPassword]
    );
    const abelId = abelRes.rows[0].id;

    // Student: Sara Bekele (id 8)
    const saraRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, avatar, phone)
       VALUES ($1, $2, $3, 'student', 'SB', '+251 93 456 7890') RETURNING id`,
      ['Sara Bekele', 'sara.student@example.com', defaultPassword]
    );
    const saraId = saraRes.rows[0].id;

    // Admin: Admin User (id 9)
    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, avatar, phone)
       VALUES ($1, $2, $3, 'admin', 'AD', '+251 90 000 0000')`,
      ['Admin User', 'admin@tutorconnect.com', defaultPassword]
    );

    // Backward-compatible test users
    const alexRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, avatar)
       VALUES ($1, $2, $3, 'student', 'AJ') RETURNING id`,
      ['Alex Johnson', 'alex.student@example.com', defaultPassword]
    );
    const alexId = alexRes.rows[0].id;

    const sarahRes = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, avatar)
       VALUES ($1, $2, $3, 'tutor', 'SC') RETURNING id`,
      ['Dr. Sarah Connor', 'sarah.math@example.com', defaultPassword]
    );
    const sarahId = sarahRes.rows[0].id;

    await client.query(
      `INSERT INTO tutor_profiles (
        user_id, bio, qualifications, subjects, grade_levels, hourly_rate, location
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sarahId,
        'Passionate Mathematics educator with 7+ years of experience in Calculus and Algebra.',
        'Ph.D. in Applied Mathematics',
        ['Calculus', 'Algebra', 'Geometry'],
        [8, 9, 10, 11, 12],
        45.00,
        'Addis Ababa / Online'
      ]
    );

    console.log('[Seed] Inserting sample bookings...');
    // Seed Bookings matching frontend bk-1001 & bk-1002
    await client.query(
      `INSERT INTO bookings (
        student_id, tutor_id, lesson_date, duration_minutes, message, status,
        booking_code, learner_name, guardian_name, subject, date_label, time_label, mode, grade_label, price, total
      ) VALUES
      ($1, 5, NOW() + INTERVAL '2 days', 60, 'Need help with kinematics and motion graphs.', 'Confirmed',
       'bk-1001', 'Abel Bekele (Learner)', 'Abel Bekele', 'Physics', 'Oct 24, 2026', '10:00 AM', 'Online', 'Grade 10', 320, 320),
      ($2, 1, NOW() + INTERVAL '3 days', 120, 'Preparing for quarterly algebra exam.', 'Pending',
       'bk-1002', 'Sara Bekele', 'Abel Bekele', 'Mathematics', 'Oct 25, 2026', '02:00 PM', 'In-person', 'Grade 8', 250, 500),
      ($3, $4, NOW() - INTERVAL '3 days', 60, 'Need help with AP Calculus Derivatives', 'completed',
       'bk-1003', 'Alex Johnson', 'Alex Johnson', 'Calculus', 'Oct 16, 2026', '04:00 PM', 'Online', 'Grade 12', 45, 45)`,
      [abelId, saraId, alexId, sarahId]
    );

    console.log('[Seed] Inserting sample inquiries & reports...');
    await client.query(`
      INSERT INTO inquiries (ticket_number, name, email, subject, message, status)
      VALUES
      ('TC-1042', 'Marta Hailu', 'marta.h@example.com', 'Lesson reschedule inquiry', 'Can I reschedule a session booked for Saturday?', 'Open'),
      ('TC-1088', 'Kebede T.', 'kebede.t@example.com', 'Tutor verification requirements', 'What documents are required to get the verified badge?', 'Resolved')
    `);

    await client.query(`
      INSERT INTO reports (type, tutor_id, target_id, reporter_name, reason, status)
      VALUES
      ('Review Report', 1, '102', 'Hanna Tesfaye', 'Student was reviewing wrong subject.', 'Open')
    `);

    await client.query('COMMIT');
    console.log('[Seed] Database seeding completed successfully!');
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
