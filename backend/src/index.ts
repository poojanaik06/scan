import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import verifyRouter from './routes/verify';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

app.use('/api', verifyRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`CertificateGuard backend listening on ${port}`);
});
