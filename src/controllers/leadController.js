const crypto = require('crypto');
const bcrypt = require('bcrypt');
const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const { sendMemberWelcomeEmail } = require('../utils/sendEmail');

function generateRandomPassword() {
    return crypto.randomBytes(9).toString('base64url').slice(0, 12);
}

async function resolveGymId(req) {
    if (req.user && req.user.gym_id) return req.user.gym_id;
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { gym_id: true },
    });
    if (!user) throw new AppError('Authenticated user not found', 404, 'USER_NOT_FOUND');
    req.user.gym_id = user.gym_id;
    return user.gym_id;
}

async function createLead(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { name, phone, email, source, stage, assignedTo, notes } = req.body;

        const duplicate = await prisma.lead.findFirst({
            where: { gym_id, phone },
            select: { id: true },
        });
        if (duplicate) {
            return next(new AppError(
                'A lead with this phone number already exists in your gym',
                409,
                'LEAD_EXISTS',
                { phone: 'Phone number already registered as a lead' }
            ));
        }

        if (assignedTo) {
            const staff = await prisma.user.findFirst({
                where: { id: assignedTo, gym_id },
                select: { id: true },
            });
            if (!staff) {
                return next(new AppError('Assigned user not found in your gym', 404, 'ASSIGNEE_NOT_FOUND'));
            }
        }

        const lead = await prisma.lead.create({
            data: {
                gym: { connect: { id: gym_id } },
                name,
                phone,
                email: email || null,
                source,
                stage: stage || 'NEW',
                assignedTo: assignedTo || null,
                notes: notes || null,
            },
        });

        return new ApiResponse(res, 201, { lead }, 'Lead created successfully.');
    } catch (error) {
        console.error('Error creating lead:', error);
        return next(error);
    }
}

async function getLeads(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const { stage, source, assignedTo, search } = req.query;

        const where = { gym_id };
        if (stage) where.stage = stage;
        if (source) where.source = source;
        if (assignedTo) where.assignedTo = assignedTo;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
            }),
            prisma.lead.count({ where }),
        ]);

        return new ApiResponse(res, 200, {
            leads,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'Leads fetched successfully.');
    } catch (error) {
        console.error('Error fetching leads:', error);
        return next(error);
    }
}

async function getLeadById(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const lead = await prisma.lead.findFirst({
            where: { id, gym_id },
            include: {
                activities: { orderBy: { created_at: 'desc' } },
                followups: { orderBy: { followup_at: 'asc' } },
            },
        });

        if (!lead) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }

        return new ApiResponse(res, 200, { lead }, 'Lead fetched successfully.');
    } catch (error) {
        console.error('Error fetching lead:', error);
        return next(error);
    }
}

async function updateLead(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { name, phone, email, source, assignedTo, notes } = req.body;

        const existing = await prisma.lead.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }

        if (phone) {
            const phoneClash = await prisma.lead.findFirst({
                where: { gym_id, phone, NOT: { id } },
                select: { id: true },
            });
            if (phoneClash) {
                return next(new AppError(
                    'Another lead already uses this phone number',
                    409,
                    'PHONE_IN_USE',
                    { phone: 'Phone number already registered' }
                ));
            }
        }

        if (assignedTo) {
            const staff = await prisma.user.findFirst({
                where: { id: assignedTo, gym_id },
                select: { id: true },
            });
            if (!staff) {
                return next(new AppError('Assigned user not found in your gym', 404, 'ASSIGNEE_NOT_FOUND'));
            }
        }

        const data = {};
        if (name !== undefined) data.name = name;
        if (phone !== undefined) data.phone = phone;
        if (email !== undefined) data.email = email || null;
        if (source !== undefined) data.source = source;
        if (assignedTo !== undefined) data.assignedTo = assignedTo || null;
        if (notes !== undefined) data.notes = notes || null;

        const lead = await prisma.lead.update({
            where: { id },
            data,
        });

        return new ApiResponse(res, 200, { lead }, 'Lead updated successfully.');
    } catch (error) {
        console.error('Error updating lead:', error);
        return next(error);
    }
}

async function changeLeadStage(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { stage, note } = req.body;

        const existing = await prisma.lead.findFirst({
            where: { id, gym_id },
            select: { id: true, stage: true },
        });
        if (!existing) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }
        if (existing.stage === stage) {
            return next(new AppError(`Lead is already in stage ${stage}`, 400, 'STAGE_UNCHANGED'));
        }

        const [lead] = await prisma.$transaction([
            prisma.lead.update({
                where: { id },
                data: { stage },
            }),
            prisma.leadActivity.create({
                data: {
                    gym_id,
                    lead: { connect: { id } },
                    done_by: req.user.id,
                    type: 'STAGE_CHANGE',
                    payload: { from: existing.stage, to: stage, note: note || null },
                },
            }),
        ]);

        return new ApiResponse(res, 200, { lead }, 'Lead stage changed successfully.');
    } catch (error) {
        console.error('Error changing lead stage:', error);
        return next(error);
    }
}

async function deleteLead(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const existing = await prisma.lead.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }

        await prisma.lead.delete({ where: { id } });

        return new ApiResponse(res, 200, null, 'Lead deleted successfully.');
    } catch (error) {
        console.error('Error deleting lead:', error);
        return next(error);
    }
}

async function addLeadActivity(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { type, payload } = req.body;

        const lead = await prisma.lead.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!lead) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }

        const activity = await prisma.leadActivity.create({
            data: {
                gym_id,
                lead: { connect: { id } },
                done_by: req.user.id,
                type,
                payload: payload || {},
            },
        });

        return new ApiResponse(res, 201, { activity }, 'Activity logged successfully.');
    } catch (error) {
        console.error('Error adding activity:', error);
        return next(error);
    }
}

async function getLeadActivities(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;

        const lead = await prisma.lead.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!lead) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }

        const activities = await prisma.leadActivity.findMany({
            where: { lead_id: id, gym_id },
            orderBy: { created_at: 'desc' },
        });

        return new ApiResponse(res, 200, { activities }, 'Activities fetched successfully.');
    } catch (error) {
        console.error('Error fetching activities:', error);
        return next(error);
    }
}

async function createFollowup(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { followup_at, note } = req.body;

        const lead = await prisma.lead.findFirst({
            where: { id, gym_id },
            select: { id: true },
        });
        if (!lead) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }

        const followup = await prisma.leadFollowup.create({
            data: {
                gym_id,
                lead: { connect: { id } },
                followup_at: new Date(followup_at),
                note: note || null,
            },
        });

        return new ApiResponse(res, 201, { followup }, 'Follow-up scheduled successfully.');
    } catch (error) {
        console.error('Error creating followup:', error);
        return next(error);
    }
}

async function getUpcomingFollowups(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 60);
        const windowEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        const followups = await prisma.leadFollowup.findMany({
            where: {
                gym_id,
                is_done: false,
                followup_at: { lte: windowEnd },
            },
            orderBy: { followup_at: 'asc' },
            include: {
                lead: { select: { id: true, name: true, phone: true, stage: true, assignedTo: true } },
            },
        });

        return new ApiResponse(res, 200, { followups, windowDays: days }, 'Upcoming follow-ups fetched.');
    } catch (error) {
        console.error('Error fetching followups:', error);
        return next(error);
    }
}

async function updateFollowup(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { followupId } = req.params;
        const { followup_at, is_done, note } = req.body;

        const existing = await prisma.leadFollowup.findFirst({
            where: { id: followupId, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Follow-up not found', 404, 'FOLLOWUP_NOT_FOUND'));
        }

        const data = {};
        if (followup_at !== undefined) data.followup_at = new Date(followup_at);
        if (is_done !== undefined) data.is_done = is_done;
        if (note !== undefined) data.note = note || null;

        const followup = await prisma.leadFollowup.update({
            where: { id: followupId },
            data,
        });

        return new ApiResponse(res, 200, { followup }, 'Follow-up updated successfully.');
    } catch (error) {
        console.error('Error updating followup:', error);
        return next(error);
    }
}

async function deleteFollowup(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { followupId } = req.params;

        const existing = await prisma.leadFollowup.findFirst({
            where: { id: followupId, gym_id },
            select: { id: true },
        });
        if (!existing) {
            return next(new AppError('Follow-up not found', 404, 'FOLLOWUP_NOT_FOUND'));
        }

        await prisma.leadFollowup.delete({ where: { id: followupId } });

        return new ApiResponse(res, 200, null, 'Follow-up deleted successfully.');
    } catch (error) {
        console.error('Error deleting followup:', error);
        return next(error);
    }
}

async function convertLeadToMember(req, res, next) {
    try {
        const gym_id = await resolveGymId(req);
        const { id } = req.params;
        const { dob, gender, notes } = req.body;

        const lead = await prisma.lead.findFirst({ where: { id, gym_id } });
        if (!lead) {
            return next(new AppError('Lead not found', 404, 'LEAD_NOT_FOUND'));
        }
        if (!lead.email) {
            return next(new AppError(
                'Lead has no email — cannot create login credentials. Add email first.',
                400,
                'LEAD_EMAIL_MISSING'
            ));
        }

        const existingMember = await prisma.member.findFirst({
            where: { gym_id, lead_id: id },
            select: { id: true },
        });
        if (existingMember) {
            return next(new AppError(
                'This lead has already been converted to a member',
                409,
                'LEAD_ALREADY_CONVERTED',
                { memberId: existingMember.id }
            ));
        }

        const phoneClash = await prisma.user.findFirst({
            where: { gym_id, phone: lead.phone },
            select: { id: true },
        });
        if (phoneClash) {
            return next(new AppError(
                'A user with this phone number already exists',
                409,
                'PHONE_IN_USE',
                { phone: 'Phone number already registered' }
            ));
        }

        const emailClash = await prisma.user.findUnique({
            where: { email: lead.email },
            select: { id: true },
        });
        if (emailClash) {
            return next(new AppError(
                'A user with this email already exists',
                409,
                'EMAIL_IN_USE',
                { email: 'Email already in use' }
            ));
        }

        const tempPassword = generateRandomPassword();
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(tempPassword, salt);

        const gym = await prisma.gym.findUnique({
            where: { id: gym_id },
            select: { name: true },
        });

        const { member, updatedLead } = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    gym: { connect: { id: gym_id } },
                    email: lead.email,
                    phone: lead.phone,
                    password_hash: passwordHash,
                    isVerified: true,
                    role: 'MEMBER',
                },
            });
            const newMember = await tx.member.create({
                data: {
                    gym: { connect: { id: gym_id } },
                    lead: { connect: { id } },
                    user: { connect: { id: newUser.id } },
                    name: lead.name,
                    dob: dob ? new Date(dob) : null,
                    gender,
                    notes: notes || lead.notes || null,
                    status: 'ACTIVE',
                },
                include: { user: { select: { id: true, email: true, phone: true } } },
            });
            const updated = await tx.lead.update({
                where: { id },
                data: { stage: 'WON' },
            });
            await tx.leadActivity.create({
                data: {
                    gym_id,
                    lead: { connect: { id } },
                    done_by: req.user.id,
                    type: 'CONVERTED',
                    payload: { from: lead.stage, to: 'WON' },
                },
            });
            return { member: newMember, updatedLead: updated };
        });

        try {
            await sendMemberWelcomeEmail({
                to: lead.email,
                name: lead.name,
                gymName: (gym && gym.name) || 'your gym',
                loginEmail: lead.email,
                password: tempPassword,
            });
        } catch (emailError) {
            console.error('Member welcome email failed (lead convert):', emailError);
        }

        return new ApiResponse(res, 201, { member, lead: updatedLead },
            'Lead converted to member. Login credentials emailed to the member.');
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    createLead,
    getLeads,
    getLeadById,
    updateLead,
    changeLeadStage,
    deleteLead,
    addLeadActivity,
    getLeadActivities,
    createFollowup,
    getUpcomingFollowups,
    updateFollowup,
    deleteFollowup,
    convertLeadToMember,
};
