require('dotenv').config();

const bcrypt = require('bcrypt');
const prisma = require('../src/config/db');

async function seedAdmin() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    }

    const existing = await prisma.user.findFirst({
        where: { email, role: 'ADMIN' },
        select: { id: true },
    });

    if (existing) {
        console.log(`Admin ${email} already exists — skipping.`);
        return;
    }

    const emailTaken = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
    });
    if (emailTaken) {
        throw new Error(
            `Email ${email} is already used by a non-admin user (role: ${emailTaken.role}). ` +
            `Pick a different ADMIN_EMAIL or remove the existing user first.`
        );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
        data: {
            email,
            password_hash: passwordHash,
            role: 'ADMIN',
            isVerified: true,
            // gym_id intentionally null — admins are platform-level, not gym-scoped
        },
        select: { id: true, email: true, role: true, created_at: true },
    });

    console.log(`Admin created: ${admin.email} (id: ${admin.id}, role: ${admin.role})`);
}

async function main() {
    console.log('Running seed...');
    await seedAdmin();
    console.log('Seed completed.');
}

main()
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
