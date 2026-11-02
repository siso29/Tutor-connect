# Tutor-Connect Backend API

Robust RESTful backend API built with **Node.js**, **Express 5**, and **PostgreSQL** (`pg`).

---

## 🚀 Features

- **User Authentication & Authorization**: Secure JWT Bearer authentication and Role-Based Access Control (RBAC) for `student`, `tutor`, and `admin` roles.
- **Tutor Profiles & Discovery**: Search, filter, and paginate tutors by subject, hourly rate, location, grade level, and review ratings.
- **Booking Management**: Complete lesson scheduling lifecycle (`pending` → `accepted` / `rejected` → `completed` or `cancelled`).
- **Ratings & Reviews**: Students can review tutors for completed bookings with star ratings (1–5) and feedback. Aggregates rating breakdowns and averages.
- **Admin Dashboard**: System metrics, user activation/deactivation, and platform-wide booking auditing.
- **Database Resilience**: PostgreSQL connection pooling, transactions, check constraints, foreign key cascades, and centralized error handling.

---

## 📁 Project Structure

```text
Tutor-connect/
├── .env                  # Environment configuration
├── package.json          # Dependencies & scripts
├── server.js             # HTTP server entrypoint & graceful shutdown
├── test-api.js           # Automated end-to-end API test suite
└── src/
    ├── app.js            # Express app configuration & middleware
    ├── config/
    │   └── db.js         # PostgreSQL Pool configuration
    ├── db/
    │   ├── schema.sql    # DDL schema definitions and indexes
    │   └── seed.js       # Database seeder with mock data
    ├── middleware/
    │   ├── auth.js       # JWT authentication & role authorization
    │   └── errorHandler.js # Centralized PostgreSQL/Express error handler
    └── routes/
        ├── admin.js      # Admin stats & user management routes
        ├── auth.js       # Register, login, profile, password change
        ├── booking.js    # Lesson booking workflows
        ├── reviews.js    # Review submission & tutor rating stats
        └── tutors.js     # Public tutor search & profile management
```

---

## 🛠️ Quick Start

### 1. Configure Environment (`.env`)

Ensure your `.env` contains your PostgreSQL database connection string and JWT secret:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:2323@localhost:5432/Tutor-connect
JWT_SECRET=your_super_secret_jwt_key
FRONTEND_ORIGIN=http://127.0.0.1:5500
```

### 2. Seed Database with Demo Data

Populate the database with realistic sample users, tutor profiles, bookings, and reviews:

```bash
npm run seed
```

### 3. Run Automated Tests

Execute the comprehensive end-to-end test suite:

```bash
npm test
```

### 4. Start the Server

```bash
# Production mode
npm start

# Development mode (with nodemon hot-reload)
npm run dev
```

The server will be available at `http://localhost:3000`.

---

## 🔑 Demo Seed Accounts

All seed accounts share the password: `Password123!`

| Role | Email | Notes |
| :--- | :--- | :--- |
| **Admin** | `admin@tutorconnect.com` | Full platform dashboard access |
| **Tutor** | `sarah.math@example.com` | AP Calculus & Math Tutor ($45/hr) |
| **Tutor** | `david.physics@example.com` | Physics & Chemistry Tutor ($50/hr) |
| **Tutor** | `elena.spanish@example.com` | Native Spanish Instructor ($35/hr) |
| **Student** | `alex.student@example.com` | Active student with past lessons |
| **Student** | `maria.student@example.com` | Active student |

---

## 📚 API Reference

### 1. Authentication (`/api/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register as `student` or `tutor` |
| `POST` | `/api/auth/login` | Public | Log in with email & password, returns JWT token |
| `GET` | `/api/auth/me` | Authenticated | Get current user profile and role details |
| `PUT` | `/api/auth/change-password` | Authenticated | Update account password |

#### Example Registration Body:
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "password": "Password123!",
  "role": "tutor",
  "bio": "Experienced SAT prep tutor.",
  "subjects": ["SAT Prep", "English"],
  "hourlyRate": 40.00,
  "location": "Boston, MA",
  "gradeLevels": [9, 10, 11, 12]
}
```

---

### 2. Tutors (`/api/tutors`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tutors` | Public | Search tutors with query filters |
| `GET` | `/api/tutors/:id` | Public | Get detailed tutor profile & recent reviews |
| `PUT` | `/api/tutors/profile` | Tutor | Update logged-in tutor's own profile |

#### Query Parameters for `/api/tutors`:
- `subject` (e.g. `Calculus`)
- `search` (matches name, bio, qualifications)
- `minRate` & `maxRate` (e.g. `minRate=30&maxRate=60`)
- `gradeLevel` (e.g. `11`)
- `location` (e.g. `New York`)
- `sortBy` (`rating_desc`, `rate_asc`, `rate_desc`, `name_asc`, `newest`)
- `page` & `limit` (pagination)

---

### 3. Bookings (`/api/bookings`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/bookings` | Student | Book a lesson with a tutor |
| `GET` | `/api/bookings` | Authenticated | List bookings for current user (`?status=...`) |
| `GET` | `/api/bookings/:id` | Authenticated | Get booking details |
| `PATCH`| `/api/bookings/:id/status` | Authenticated | Update status (`accepted`, `rejected`, `cancelled`, `completed`) |

#### Example Booking Request:
```json
{
  "tutorId": 2,
  "lessonDate": "2026-10-15T15:00:00Z",
  "durationMinutes": 60,
  "message": "Need help reviewing kinematics."
}
```

---

### 4. Reviews (`/api/reviews`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/reviews` | Student | Review a completed booking (`rating`: 1–5) |
| `GET` | `/api/reviews/tutor/:tutorId`| Public | List tutor reviews & aggregated star breakdown |
| `GET` | `/api/reviews/booking/:bookingId` | Authenticated | Get review for a booking |

---

### 5. Admin Dashboard (`/api/admin`)

Requires `Authorization: Bearer <admin_token>`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Platform statistics (users, bookings, reviews) |
| `GET` | `/api/admin/users` | List/filter/search all platform users |
| `PATCH`| `/api/admin/users/:id/status` | Toggle user `isActive` status (activate/suspend) |
| `GET` | `/api/admin/bookings` | Full audit log of all bookings across the platform |

## Payments

`GET /api/payments/methods` requires authentication and returns the payment options available through Chapa hosted checkout, the currency, and whether Chapa is configured. Chapa determines which methods are enabled for a merchant and transaction.
