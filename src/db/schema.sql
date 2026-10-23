-- Schema for Tutor-connect
-- Database: PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'guardian', 'learner', 'tutor', 'admin')),
  avatar VARCHAR(50),
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tutor_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  qualifications TEXT,
  subjects TEXT[] DEFAULT '{}',
  grade_levels INTEGER[] DEFAULT '{}' CHECK (grade_levels <@ ARRAY[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  hourly_rate NUMERIC DEFAULT 0 CHECK (hourly_rate >= 0),
  location VARCHAR(255),
  modes TEXT[] DEFAULT '{Online, In-person}',
  experience INTEGER DEFAULT 3,
  availability VARCHAR(100) DEFAULT 'Sat 10:00',
  available_days TEXT[] DEFAULT '{Mon, Wed, Sat}',
  available_times TEXT[] DEFAULT '{09:00, 10:00, 14:00, 16:00}',
  verified BOOLEAN DEFAULT TRUE,
  verification_status VARCHAR(50) DEFAULT 'Verified',
  description TEXT,
  method TEXT,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_date TIMESTAMP WITHOUT TIME ZONE,
  duration_minutes INTEGER DEFAULT 60,
  message TEXT,
  status VARCHAR(50) DEFAULT 'Pending',
  booking_code VARCHAR(100),
  learner_name VARCHAR(255),
  guardian_name VARCHAR(255),
  subject VARCHAR(100),
  date_label VARCHAR(100),
  time_label VARCHAR(100),
  mode VARCHAR(50),
  grade_label VARCHAR(50),
  price NUMERIC,
  total NUMERIC,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating NUMERIC NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  author_name VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inquiries (
  id SERIAL PRIMARY KEY,
  ticket_number VARCHAR(50),
  name VARCHAR(255),
  email VARCHAR(255),
  subject VARCHAR(255),
  message TEXT,
  status VARCHAR(50) DEFAULT 'Open',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) DEFAULT 'Review Report',
  tutor_id INTEGER,
  target_id VARCHAR(100),
  reporter_name VARCHAR(255),
  reason TEXT,
  status VARCHAR(50) DEFAULT 'Open',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Helpful indexes for performant lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_bookings_student_id ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tutor_id ON bookings(tutor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_reviews_tutor_id ON reviews(tutor_id);

-- Add payment status to existing bookings
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid';

-- Store payment transactions
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_reference VARCHAR(255) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ETB',
    platform_commission NUMERIC(12,2) DEFAULT 0,
    tutor_earnings NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    chapa_reference VARCHAR(255),
    payment_method VARCHAR(100),
    provider_payload JSONB,
    verified_at TIMESTAMP,
    checkout_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store webhook events to prevent duplicate processing
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id SERIAL PRIMARY KEY,
    event_key VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100),
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store user notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type VARCHAR(100),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Store user notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);