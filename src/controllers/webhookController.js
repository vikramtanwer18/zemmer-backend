const prisma = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const { verifyWebhookSignature } = require('../services/razorpayService');
const { sendEmail } = require('../utils/sendEmail');
const { getNowIST } = require('../utils/timezone');

// ============ WEBHOOK HANDLER ============
async function handleRazorpayWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

    if (!signature) {
      return next(new AppError(
        'Webhook signature missing',
        400,
        'MISSING_SIGNATURE'
      ));
    }

    const isValidSignature = verifyWebhookSignature(body, signature);
    if (!isValidSignature) {
      return next(new AppError(
        'Invalid webhook signature',
        400,
        'INVALID_SIGNATURE'
      ));
    }

    const { event, payload } = body;

    switch (event) {
      case 'subscription.charged':
        await handleSubscriptionCharged(payload);
        break;
      case 'subscription.pending':
        await handleSubscriptionPending(payload);
        break;
      case 'subscription.halted':
        await handleSubscriptionHalted(payload);
        break;
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(payload);
        break;
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    return new ApiResponse(res, 200, { received: true }, 'Webhook processed successfully.');
  } catch (error) {
    console.error('Webhook handler error:', error);
    return next(error);
  }
}

// ============ EVENT HANDLERS ============

async function handleSubscriptionCharged(payload) {
  try {
    const { subscription, payment } = payload;
    const rzpSubId = subscription.id;
    const rzpPaymentId = payment.id;

    const sub = await prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: rzpSubId },
      include: {
        gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
        saasPlan: { select: { id: true, key: true, name: true } },
      },
    });

    if (!sub) {
      console.warn(`Subscription not found for Razorpay ID: ${rzpSubId}`);
      return;
    }

    const periodStart = new Date(subscription.current_period_start * 1000);
    const periodEnd = new Date(subscription.current_period_end * 1000);

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      }),
      prisma.billingInvoice.create({
        data: {
          subscription_id: sub.id,
          amount_paise: payment.amount,
          status: 'PAID',
          razorpayPaymentId: rzpPaymentId,
          razorpayOrderId: payment.order_id || null,
          paid_at: getNowIST(),
        },
      }),
      prisma.subscriptionAuditLog.create({
        data: {
          subscription_id: sub.id,
          action: 'RENEWED',
          changedBy: 'SYSTEM',
          details: {
            razorpay_payment_id: rzpPaymentId,
            amount: payment.amount,
            period_end: periodEnd,
          },
        },
      }),
    ]);

    if (sub.gym?.user?.email) {
      const html = `<p>Hello ${sub.gym.gymName},</p>
        <p>Your ${sub.saasPlan.name} subscription has been renewed.</p>
        <p>Next billing date: ${periodEnd.toLocaleDateString()}</p>
        <p>Thank you for your subscription.</p>`;
      await sendEmail({
        to: sub.gym.user.email,
        subject: 'Your subscription has been renewed',
        html,
        text: `Your ${sub.saasPlan.name} subscription has been renewed. Next billing: ${periodEnd.toLocaleDateString()}`,
      }).catch(err => console.error('Email send failed:', err));
    }
  } catch (error) {
    console.error('handleSubscriptionCharged error:', error);
  }
}

async function handleSubscriptionPending(payload) {
  try {
    const { subscription, payment } = payload;
    const rzpSubId = subscription.id;

    const sub = await prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: rzpSubId },
      include: {
        gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
      },
    });

    if (!sub) {
      console.warn(`Subscription not found for Razorpay ID: ${rzpSubId}`);
      return;
    }

    const gracePeriodStartedAt = getNowIST();

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'PAST_DUE',
          gracePeriodStartedAt,
        },
      }),
      prisma.billingInvoice.create({
        data: {
          subscription_id: sub.id,
          amount_paise: payment.amount,
          status: 'FAILED',
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id || null,
          failed_at: getNowIST(),
          failure_reason: subscription.short_url ? 'Payment declined' : 'Unknown',
        },
      }),
      prisma.subscriptionAuditLog.create({
        data: {
          subscription_id: sub.id,
          action: 'PAYMENT_FAILED',
          changedBy: 'SYSTEM',
          details: {
            reason: 'Card declined - retrying',
            gracePeriodEndsAt: new Date(gracePeriodStartedAt.getTime() + 3 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    if (sub.gym?.user?.email) {
      const graceEndsAt = new Date(gracePeriodStartedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const html = `<p>Hello ${sub.gym.gymName},</p>
        <p>Your payment failed. You have a 3-day grace period.</p>
        <p>Grace period expires: ${graceEndsAt.toLocaleDateString()}</p>
        <p>Update your payment method to avoid service interruption.</p>`;
      await sendEmail({
        to: sub.gym.user.email,
        subject: 'Payment Failed - Grace Period Active',
        html,
        text: `Your payment failed. Grace period ends: ${graceEndsAt.toLocaleDateString()}`,
      }).catch(err => console.error('Email send failed:', err));
    }
  } catch (error) {
    console.error('handleSubscriptionPending error:', error);
  }
}

async function handleSubscriptionHalted(payload) {
  try {
    const { subscription } = payload;
    const rzpSubId = subscription.id;

    const sub = await prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: rzpSubId },
      include: {
        gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
      },
    });

    if (!sub) {
      console.warn(`Subscription not found for Razorpay ID: ${rzpSubId}`);
      return;
    }

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'EXPIRED',
        },
      }),
      prisma.subscriptionAuditLog.create({
        data: {
          subscription_id: sub.id,
          action: 'EXPIRED',
          changedBy: 'SYSTEM',
          details: { reason: 'Grace period ended - payment unrecovered' },
        },
      }),
    ]);

    if (sub.gym?.user?.email) {
      const html = `<p>Hello ${sub.gym.gymName},</p>
        <p>Your subscription has expired. Your gym is now locked.</p>
        <p>To reactivate, choose a plan and complete payment.</p>`;
      await sendEmail({
        to: sub.gym.user.email,
        subject: 'Your subscription has expired',
        html,
        text: 'Your subscription has expired. Your gym is now locked.',
      }).catch(err => console.error('Email send failed:', err));
    }
  } catch (error) {
    console.error('handleSubscriptionHalted error:', error);
  }
}

async function handleSubscriptionCancelled(payload) {
  try {
    const { subscription } = payload;
    const rzpSubId = subscription.id;

    const sub = await prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: rzpSubId },
      include: {
        gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
      },
    });

    if (!sub) {
      console.warn(`Subscription not found for Razorpay ID: ${rzpSubId}`);
      return;
    }

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: getNowIST(),
        },
      }),
      prisma.subscriptionAuditLog.create({
        data: {
          subscription_id: sub.id,
          action: 'CANCELLED',
          changedBy: 'SYSTEM',
          details: { reason: 'Subscription cancelled' },
        },
      }),
    ]);

    if (sub.gym?.user?.email) {
      const html = `<p>Hello ${sub.gym.gymName},</p>
        <p>Your subscription has been cancelled.</p>
        <p>Thank you for using Gym Management.</p>`;
      await sendEmail({
        to: sub.gym.user.email,
        subject: 'Your subscription has been cancelled',
        html,
        text: 'Your subscription has been cancelled.',
      }).catch(err => console.error('Email send failed:', err));
    }
  } catch (error) {
    console.error('handleSubscriptionCancelled error:', error);
  }
}

async function handlePaymentCaptured(payload) {
  try {
    const { payment } = payload;
    const rzpPaymentId = payment.id;
    const rzpOrderId = payment.order_id;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { razorpayOrderId: rzpOrderId },
      include: {
        subscription: {
          include: {
            gym: { select: { id: true, gymName: true, user: { select: { email: true } } } },
          },
        },
      },
    });

    if (!invoice) {
      console.warn(`Invoice not found for Razorpay Order ID: ${rzpOrderId}`);
      return;
    }

    const sub = invoice.subscription;

    await prisma.$transaction([
      prisma.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          razorpayPaymentId: rzpPaymentId,
          paid_at: getNowIST(),
        },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
        },
      }),
      prisma.subscriptionAuditLog.create({
        data: {
          subscription_id: sub.id,
          action: 'PAYMENT_CAPTURED',
          changedBy: 'SYSTEM',
          details: {
            razorpay_payment_id: rzpPaymentId,
            amount: payment.amount,
          },
        },
      }),
    ]);

    if (sub.gym?.user?.email) {
      const amountRupees = (payment.amount / 100).toFixed(2);
      const html = `<p>Hello ${sub.gym.gymName},</p>
        <p>Your payment of ₹${amountRupees} was successful!</p>
        <p>Your subscription is now active.</p>
        <p>Thank you for your business.</p>`;
      await sendEmail({
        to: sub.gym.user.email,
        subject: 'Payment Successful - Subscription Active',
        html,
        text: `Payment of ₹${amountRupees} successful. Subscription is now active.`,
      }).catch(err => console.error('Email send failed:', err));
    }
  } catch (error) {
    console.error('handlePaymentCaptured error:', error);
  }
}

async function handlePaymentFailed(payload) {
  try {
    const { payment } = payload;
    const rzpPaymentId = payment.id;
    const rzpOrderId = payment.order_id;

    if (!rzpOrderId) {
      console.warn(`No order ID in failed payment: ${rzpPaymentId}`);
      return;
    }

    const invoice = await prisma.billingInvoice.findUnique({
      where: { razorpayOrderId: rzpOrderId },
      include: { subscription: { include: { gym: true } } },
    });

    if (!invoice) {
      console.warn(`Invoice not found for Razorpay Order ID: ${rzpOrderId}`);
      return;
    }

    await prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        status: 'FAILED',
        failed_at: getNowIST(),
        failure_reason: 'Payment declined by bank',
      },
    });
  } catch (error) {
    console.error('handlePaymentFailed error:', error);
  }
}

module.exports = {
  handleRazorpayWebhook,
};
