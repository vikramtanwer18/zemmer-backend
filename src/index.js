require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const prisma = require('./config/db');
const errorHandler = require('./middlewares/errorMiddleware');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser());

// Webhook route (before JSON parser to get raw body for signature verification)
app.use('/api/v1/webhooks', express.json(), require('./routes/webhookRoute'));

app.use(express.json());

// Static file serving for user-uploaded images
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d',
    fallthrough: false,
}));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API routes
app.use('/api/v1/auth', require('./routes/authRoute'));
app.use('/api/v1/users', require('./routes/userRoute'));
app.use('/api/v1/members', require('./routes/memberRoute'));
app.use('/api/v1/plans', require('./routes/planRoute'));
app.use('/api/v1/memberships', require('./routes/membershipRoute'));
app.use('/api/v1/attendance', require('./routes/attendanceRoute'));
app.use('/api/v1/staff', require('./routes/staffMemberRoute'));
app.use('/api/v1/classes', require('./routes/classRoute'));
app.use('/api/v1/bookings', require('./routes/bookingRoute'));
app.use('/api/v1/leads', require('./routes/leadRoute'));
app.use('/api/v1/analytics', require('./routes/analyticsRoute'));
app.use('/api/v1/gym', require('./routes/gymRoute'));
app.use('/api/v1/subscription', require('./routes/subscriptionRoute'));
app.use('/api/v1/admin', require('./routes/adminRoute'));

app.use(errorHandler);

const { startSubscriptionCron } = require('./jobs/subscriptionCron');

app.listen(process.env.PORT, async () => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('Connected to the database successfully!');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
    startSubscriptionCron();
    console.log(`Server is running on port ${process.env.PORT}`);
});
