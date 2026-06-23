import express from 'express';
import pool from '../db';
import crypto from 'crypto';

const router = express.Router();

// POST /api/verify
router.post('/verify', async (req, res) => {
  const { certificateId, token } = req.body;
  if (!certificateId || !token) return res.status(400).json({ error: 'Missing fields' });

  try {
    const q = `SELECT c.certificate_id, c.verification_token, c.issue_date, c.status, u.full_name, co.course_name, co.issuer
               FROM certificates c
               JOIN users u ON c.user_id = u.id
               JOIN courses co ON c.course_id = co.id
               WHERE c.certificate_id = $1`;
    const { rows } = await pool.query(q, [certificateId]);
    if (!rows.length) return res.json({ status: 'invalid', message: 'Certificate not found' });

    const cert = rows[0];

    // Token check - tokens are stored hashed (sha256)
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    if (hashed !== cert.verification_token) {
      return res.json({ status: 'invalid', message: 'Token mismatch' });
    }

    if (cert.status === 'revoked') {
      const revQ = `SELECT revocation_reason, revocation_date FROM certificates WHERE certificate_id = $1`;
      const rev = await pool.query(revQ, [certificateId]);
      return res.json({
        status: 'revoked',
        holderName: cert.full_name,
        courseName: cert.course_name,
        issuer: cert.issuer,
        revocationReason: rev.rows[0]?.revocation_reason || null,
        revocationDate: rev.rows[0]?.revocation_date || null
      });
    }

    if (cert.status === 'in_progress') {
      // For demo, provide a progress percentage if available
      const progressQ = `SELECT progress FROM certificates WHERE certificate_id = $1`;
      const p = await pool.query(progressQ, [certificateId]);
      return res.json({
        status: 'in_progress',
        holderName: cert.full_name,
        courseName: cert.course_name,
        issuer: cert.issuer,
        progress: p.rows[0]?.progress || 0
      });
    }

    // Verified
    await pool.query('INSERT INTO verification_logs (certificate_id, verifier_ip, verification_time) VALUES ($1,$2,NOW())', [certificateId, req.ip]);

    return res.json({
      status: 'verified',
      holderName: cert.full_name,
      courseName: cert.course_name,
      issuer: cert.issuer,
      issueDate: cert.issue_date,
      certificateId: cert.certificate_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
