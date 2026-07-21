const Razorpay = require('razorpay');
const crypto = require('crypto');
const AppError = require('../utils/appError');

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_API_KEY,
  key_secret: process.env.RAZORPAY_API_SECRET,
});

// ============ CUSTOMERS ============
async function createCustomer(customerData) {
  try {
    const customer = await razorpayInstance.customers.create({
      email: customerData.email,
      contact: customerData.contact || null,
      name: customerData.name,
      notes: customerData.notes || {},
    });
    return customer;
  } catch (error) {
    throw new AppError(
      `Razorpay customer creation failed: ${error.message}`,
      500,
      'RAZORPAY_CUSTOMER_ERROR',
      { razorpayError: error.message }
    );
  }
}

async function fetchCustomer(customerId) {
  try {
    const customer = await razorpayInstance.customers.fetch(customerId);
    return customer;
  } catch (error) {
    throw new AppError(
      `Razorpay customer fetch failed: ${error.message}`,
      500,
      'RAZORPAY_CUSTOMER_ERROR'
    );
  }
}

// ============ SUBSCRIPTIONS ============
async function createSubscription(subscriptionData) {
  try {
    const subscription = await razorpayInstance.subscriptions.create({
      plan_id: subscriptionData.planId,
      customer_notify: 1,
      quantity: subscriptionData.quantity || 1,
      total_count: subscriptionData.totalCount || null,
      addons: subscriptionData.addons || [],
      notes: subscriptionData.notes || {},
      customer_id: subscriptionData.customerId,
    });
    return subscription;
  } catch (error) {
    throw new AppError(
      `Razorpay subscription creation failed: ${error.message}`,
      500,
      'RAZORPAY_SUBSCRIPTION_ERROR',
      { razorpayError: error.message }
    );
  }
}

async function fetchSubscription(subscriptionId) {
  try {
    const subscription = await razorpayInstance.subscriptions.fetch(subscriptionId);
    return subscription;
  } catch (error) {
    throw new AppError(
      `Razorpay subscription fetch failed: ${error.message}`,
      500,
      'RAZORPAY_SUBSCRIPTION_ERROR'
    );
  }
}

async function cancelSubscription(subscriptionId) {
  try {
    const subscription = await razorpayInstance.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    throw new AppError(
      `Razorpay subscription cancellation failed: ${error.message}`,
      500,
      'RAZORPAY_SUBSCRIPTION_ERROR'
    );
  }
}

async function pauseSubscription(subscriptionId) {
  try {
    const subscription = await razorpayInstance.subscriptions.pause(subscriptionId);
    return subscription;
  } catch (error) {
    throw new AppError(
      `Razorpay subscription pause failed: ${error.message}`,
      500,
      'RAZORPAY_SUBSCRIPTION_ERROR'
    );
  }
}

async function resumeSubscription(subscriptionId) {
  try {
    const subscription = await razorpayInstance.subscriptions.resume(subscriptionId);
    return subscription;
  } catch (error) {
    throw new AppError(
      `Razorpay subscription resume failed: ${error.message}`,
      500,
      'RAZORPAY_SUBSCRIPTION_ERROR'
    );
  }
}

// ============ ORDERS ============
async function createOrder(orderData) {
  try {
    const order = await razorpayInstance.orders.create({
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      receipt: orderData.receipt || `receipt_${Date.now()}`,
      customer_id: orderData.customerId || null,
      description: orderData.description || null,
      notes: orderData.notes || {},
    });
    return order;
  } catch (error) {
    throw new AppError(
      `Razorpay order creation failed: ${error.message}`,
      500,
      'RAZORPAY_ORDER_ERROR',
      { razorpayError: error.message }
    );
  }
}

async function fetchOrder(orderId) {
  try {
    const order = await razorpayInstance.orders.fetch(orderId);
    return order;
  } catch (error) {
    throw new AppError(
      `Razorpay order fetch failed: ${error.message}`,
      500,
      'RAZORPAY_ORDER_ERROR'
    );
  }
}

// ============ PAYMENTS ============
async function fetchPayment(paymentId) {
  try {
    const payment = await razorpayInstance.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    throw new AppError(
      `Razorpay payment fetch failed: ${error.message}`,
      500,
      'RAZORPAY_PAYMENT_ERROR'
    );
  }
}

async function capturePayment(paymentId, amount) {
  try {
    const payment = await razorpayInstance.payments.capture(paymentId, amount);
    return payment;
  } catch (error) {
    throw new AppError(
      `Razorpay payment capture failed: ${error.message}`,
      500,
      'RAZORPAY_PAYMENT_ERROR'
    );
  }
}

async function refundPayment(paymentId, refundData) {
  try {
    const refund = await razorpayInstance.payments.refund(paymentId, {
      amount: refundData.amount || null,
      notes: refundData.notes || {},
      receipt: refundData.receipt || null,
    });
    return refund;
  } catch (error) {
    throw new AppError(
      `Razorpay refund creation failed: ${error.message}`,
      500,
      'RAZORPAY_REFUND_ERROR',
      { razorpayError: error.message }
    );
  }
}

// ============ WEBHOOK VERIFICATION ============
function verifyWebhookSignature(body, signature) {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');

    return signature === expectedSignature;
  } catch (error) {
    return false;
  }
}

module.exports = {
  createCustomer,
  fetchCustomer,
  createSubscription,
  fetchSubscription,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  createOrder,
  fetchOrder,
  fetchPayment,
  capturePayment,
  refundPayment,
  verifyWebhookSignature,
};
