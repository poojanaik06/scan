-- PostgreSQL schema for CertificateGuard

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  course_name TEXT NOT NULL,
  issuer TEXT NOT NULL
);

CREATE TABLE certificates (
  id SERIAL PRIMARY KEY,
  certificate_id TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  verification_token TEXT NOT NULL,
  issue_date DATE,
  status TEXT DEFAULT 'verified',
  qr_url TEXT,
  progress INTEGER,
  revocation_reason TEXT,
  revocation_date TIMESTAMP
);

CREATE TABLE verification_logs (
  id SERIAL PRIMARY KEY,
  certificate_id TEXT NOT NULL,
  verifier_ip TEXT,
  verification_time TIMESTAMP DEFAULT NOW()
);
