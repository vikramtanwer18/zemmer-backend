const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!process.env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM is not configured');
  }

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message || JSON.stringify(error)}`);
  }
  return data;
}

function buildOtpEmail({ name, otp, expiresInMinutes, gymName }) {
  const safeName = escapeHtml(name || 'there');
  const safeGym = escapeHtml(gymName || 'your gym');
  const safeOtp = escapeHtml(String(otp));

  const subject = `Your verification code: ${otp}`;

  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Welcome to Gym Management! Use the code below to verify your email for ${gymName || 'your gym'}:`,
    ``,
    `    ${otp}`,
    ``,
    `This code expires in ${expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email.`,
    ``,
    `— The Gym Management team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;">
    Your verification code is ${safeOtp}. It expires in ${expiresInMinutes} minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(17,24,39,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#111827 0%,#1f2937 100%);padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">
                      Gym Management
                    </div>
                  </td>
                  <td align="right" style="color:#9ca3af;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;">
                    Email verification
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.01em;">
                Verify your email
              </h1>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                Hi ${safeName}, welcome aboard. To finish setting up <strong>${safeGym}</strong>, enter the verification code below in the app.
              </p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:28px;text-align:center;">
                <div style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
                  Your verification code
                </div>
                <div style="font-family:'SF Mono','Courier New',monospace;font-size:36px;font-weight:700;color:#111827;letter-spacing:0.35em;line-height:1.1;">
                  ${safeOtp}
                </div>
                <div style="margin-top:14px;color:#6b7280;font-size:13px;">
                  Expires in <strong style="color:#111827;">${expiresInMinutes} minutes</strong>
                </div>
              </div>
              <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                If you didn't create an account with Gym Management, you can safely ignore this email &mdash; no further action is needed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;">
              <div style="border-top:1px solid #e5e7eb;padding-top:20px;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
                For your security, never share this code with anyone. We will never ask for it over the phone or email.
              </div>
            </td>
          </tr>
        </table>
        <div style="color:#9ca3af;font-size:12px;margin-top:20px;">
          &copy; ${new Date().getFullYear()} Gym Management. All rights reserved.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

async function sendOtpEmail({ to, name, otp, expiresInMinutes, gymName }) {
  const { subject, html, text } = buildOtpEmail({ name, otp, expiresInMinutes, gymName });
  return sendEmail({ to, subject, html, text });
}

function buildPasswordResetEmail({ name, otp, expiresInMinutes }) {
  const safeName = escapeHtml(name || 'there');
  const safeOtp = escapeHtml(String(otp));

  const subject = `Password reset code: ${otp}`;

  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Someone requested a password reset for your Gym Management account. Use the code below to set a new password:`,
    ``,
    `    ${otp}`,
    ``,
    `This code expires in ${expiresInMinutes} minutes. If you didn't request a password reset, you can safely ignore this email — your password won't change.`,
    ``,
    `— The Gym Management team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;">
    Your password reset code is ${safeOtp}. It expires in ${expiresInMinutes} minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(17,24,39,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#7c2d12 0%,#991b1b 100%);padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">
                      Gym Management
                    </div>
                  </td>
                  <td align="right" style="color:#fca5a5;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;">
                    Password reset
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.01em;">
                Reset your password
              </h1>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                Hi ${safeName}, we received a request to reset your password. Enter the code below in the app to choose a new one.
              </p>
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:28px;text-align:center;">
                <div style="color:#991b1b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:12px;">
                  Your reset code
                </div>
                <div style="font-family:'SF Mono','Courier New',monospace;font-size:36px;font-weight:700;color:#7c2d12;letter-spacing:0.35em;line-height:1.1;">
                  ${safeOtp}
                </div>
                <div style="margin-top:14px;color:#991b1b;font-size:13px;">
                  Expires in <strong style="color:#7c2d12;">${expiresInMinutes} minutes</strong>
                </div>
              </div>
              <p style="margin:28px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email &mdash; your password will not be changed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;">
              <div style="border-top:1px solid #e5e7eb;padding-top:20px;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
                For your security, never share this code with anyone. We will never ask for it over the phone or email.
              </div>
            </td>
          </tr>
        </table>
        <div style="color:#9ca3af;font-size:12px;margin-top:20px;">
          &copy; ${new Date().getFullYear()} Gym Management. All rights reserved.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

async function sendPasswordResetEmail({ to, name, otp, expiresInMinutes }) {
  const { subject, html, text } = buildPasswordResetEmail({ name, otp, expiresInMinutes });
  return sendEmail({ to, subject, html, text });
}

function buildMemberWelcomeEmail({ name, gymName, loginEmail, password }) {
  const safeName = escapeHtml(name || 'there');
  const safeGym = escapeHtml(gymName || 'your gym');
  const safeEmail = escapeHtml(loginEmail);
  const safePassword = escapeHtml(password);

  const subject = `Welcome to ${gymName || 'Gym Management'} — your login details`;

  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Welcome to ${gymName || 'your gym'}! Your member account has been created. Use the credentials below to log in to the app:`,
    ``,
    `    Email:    ${loginEmail}`,
    `    Password: ${password}`,
    ``,
    `Please log in and change your password from the profile section. For your security, do not share these credentials with anyone.`,
    ``,
    `— The ${gymName || 'Gym Management'} team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;">
    Welcome to ${safeGym}. Your login email is ${safeEmail}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(17,24,39,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#065f46 0%,#047857 100%);padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">
                      ${safeGym}
                    </div>
                  </td>
                  <td align="right" style="color:#a7f3d0;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;">
                    Welcome
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.01em;">
                Welcome aboard, ${safeName}!
              </h1>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                Your member account at <strong>${safeGym}</strong> is ready. Use the credentials below to log in to the app.
              </p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-bottom:14px;">
                      <div style="color:#065f46;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">
                        Email
                      </div>
                      <div style="font-family:'SF Mono','Courier New',monospace;font-size:15px;color:#111827;word-break:break-all;">
                        ${safeEmail}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="border-top:1px solid #bbf7d0;padding-top:14px;">
                      <div style="color:#065f46;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">
                        Temporary Password
                      </div>
                      <div style="font-family:'SF Mono','Courier New',monospace;font-size:18px;font-weight:700;color:#065f46;letter-spacing:0.05em;">
                        ${safePassword}
                      </div>
                    </td>
                  </tr>
                </table>
              </div>
              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                For your security, please log in and change your password from the profile section as soon as possible.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;">
              <div style="border-top:1px solid #e5e7eb;padding-top:20px;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
                Never share your password with anyone. If you didn't expect this email, please contact your gym staff.
              </div>
            </td>
          </tr>
        </table>
        <div style="color:#9ca3af;font-size:12px;margin-top:20px;">
          &copy; ${new Date().getFullYear()} ${safeGym}. All rights reserved.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

async function sendMemberWelcomeEmail({ to, name, gymName, loginEmail, password }) {
  const { subject, html, text } = buildMemberWelcomeEmail({ name, gymName, loginEmail, password });
  return sendEmail({ to, subject, html, text });
}

function buildStaffWelcomeEmail({ name, gymName, role, loginEmail, password }) {
  const safeName = escapeHtml(name || 'there');
  const safeGym = escapeHtml(gymName || 'the gym');
  const safeEmail = escapeHtml(loginEmail);
  const safePassword = escapeHtml(password);
  const roleLabel = role === 'COACH' ? 'Coach' : 'Trainer';
  const safeRole = escapeHtml(roleLabel);

  const subject = `Welcome to ${gymName || 'Gym Management'} — your ${roleLabel.toLowerCase()} account`;

  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Welcome to ${gymName || 'the gym'}! Your ${roleLabel.toLowerCase()} account has been created. Use the credentials below to log in to the staff app:`,
    ``,
    `    Email:    ${loginEmail}`,
    `    Password: ${password}`,
    `    Role:     ${roleLabel}`,
    ``,
    `Please log in and change your password from the profile section. For your security, do not share these credentials with anyone.`,
    ``,
    `— The ${gymName || 'Gym Management'} team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;">
    Welcome to ${safeGym} as a ${safeRole}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(17,24,39,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:28px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">
                      ${safeGym}
                    </div>
                  </td>
                  <td align="right" style="color:#bfdbfe;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;">
                    ${safeRole} onboarding
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.01em;">
                Welcome to the team, ${safeName}!
              </h1>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                Your <strong>${safeRole}</strong> account at <strong>${safeGym}</strong> is ready. Use the credentials below to log in to the staff app.
              </p>
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-bottom:14px;">
                      <div style="color:#1e3a8a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">
                        Email
                      </div>
                      <div style="font-family:'SF Mono','Courier New',monospace;font-size:15px;color:#111827;word-break:break-all;">
                        ${safeEmail}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="border-top:1px solid #bfdbfe;padding:14px 0;">
                      <div style="color:#1e3a8a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">
                        Temporary Password
                      </div>
                      <div style="font-family:'SF Mono','Courier New',monospace;font-size:18px;font-weight:700;color:#1e3a8a;letter-spacing:0.05em;">
                        ${safePassword}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="border-top:1px solid #bfdbfe;padding-top:14px;">
                      <div style="color:#1e3a8a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">
                        Role
                      </div>
                      <div style="font-family:'SF Mono','Courier New',monospace;font-size:15px;color:#111827;">
                        ${safeRole}
                      </div>
                    </td>
                  </tr>
                </table>
              </div>
              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                For your security, please log in and change your password from the profile section as soon as possible.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px;">
              <div style="border-top:1px solid #e5e7eb;padding-top:20px;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
                Never share your password with anyone. If you didn't expect this email, please contact the gym owner.
              </div>
            </td>
          </tr>
        </table>
        <div style="color:#9ca3af;font-size:12px;margin-top:20px;">
          &copy; ${new Date().getFullYear()} ${safeGym}. All rights reserved.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

async function sendStaffWelcomeEmail({ to, name, gymName, role, loginEmail, password }) {
  const { subject, html, text } = buildStaffWelcomeEmail({ name, gymName, role, loginEmail, password });
  return sendEmail({ to, subject, html, text });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTrialReminderEmail({ name, gymName, daysLeft, planName, upgradeUrl }) {
  const safeName = escapeHtml(name || 'there');
  const safeGym = escapeHtml(gymName || 'your gym');
  const safePlan = escapeHtml(planName || 'Trial');
  const safeUrl = escapeHtml(upgradeUrl || '#');

  const subject = daysLeft <= 1
    ? `${safeGym}: your trial ends tomorrow`
    : `${safeGym}: ${daysLeft} days left in your trial`;

  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Your ${planName || 'free trial'} for ${gymName || 'your gym'} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    ``,
    `Upgrade now to keep your gym running without interruption: ${upgradeUrl || ''}`,
    ``,
    `If you don't upgrade, your gym will be locked when the trial ends.`,
    ``,
    `— The Gym Management team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(17,24,39,0.06);">
        <tr><td style="background:linear-gradient(135deg,#b45309 0%,#d97706 100%);padding:28px 40px;">
          <div style="color:#ffffff;font-size:20px;font-weight:700;">${safeGym}</div>
          <div style="color:#fde68a;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">Trial reminder</div>
        </td></tr>
        <tr><td style="padding:40px 40px 8px;">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;">${daysLeft} day${daysLeft === 1 ? '' : 's'} left, ${safeName}</h1>
          <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
            Your <strong>${safePlan}</strong> trial for <strong>${safeGym}</strong> ends ${daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`}. Upgrade now to keep your gym running.
          </p>
          <table role="presentation"><tr><td style="background:#d97706;border-radius:8px;">
            <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:700;text-decoration:none;font-size:14px;">Upgrade Now</a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
            When the trial ends, your gym will be locked from creating members, classes, and bookings until you upgrade.
          </p>
        </td></tr>
        <tr><td style="padding:24px 40px 32px;">
          <div style="border-top:1px solid #e5e7eb;padding-top:20px;color:#9ca3af;font-size:12px;text-align:center;">
            Need help? Reply to this email — our team is happy to walk you through your options.
          </div>
        </td></tr>
      </table>
      <div style="color:#9ca3af;font-size:12px;margin-top:20px;">&copy; ${new Date().getFullYear()} Gym Management.</div>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

async function sendTrialReminderEmail({ to, name, gymName, daysLeft, planName, upgradeUrl }) {
  const { subject, html, text } = buildTrialReminderEmail({ name, gymName, daysLeft, planName, upgradeUrl });
  return sendEmail({ to, subject, html, text });
}

function buildTrialExpiredEmail({ name, gymName, planName, upgradeUrl }) {
  const safeName = escapeHtml(name || 'there');
  const safeGym = escapeHtml(gymName || 'your gym');
  const safePlan = escapeHtml(planName || 'Trial');
  const safeUrl = escapeHtml(upgradeUrl || '#');

  const subject = `${safeGym}: your trial has ended`;
  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Your ${planName || 'trial'} for ${gymName || 'your gym'} has ended. Your gym is now locked from creating members, classes, and bookings.`,
    ``,
    `Existing members can still see their accounts (read-only) but staff can't add new ones until you upgrade.`,
    ``,
    `Upgrade now: ${upgradeUrl || ''}`,
    ``,
    `— The Gym Management team`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(17,24,39,0.06);">
        <tr><td style="background:linear-gradient(135deg,#7c2d12 0%,#991b1b 100%);padding:28px 40px;">
          <div style="color:#ffffff;font-size:20px;font-weight:700;">${safeGym}</div>
          <div style="color:#fecaca;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">Trial ended</div>
        </td></tr>
        <tr><td style="padding:40px 40px 8px;">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;">Your trial has ended, ${safeName}</h1>
          <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
            Your <strong>${safePlan}</strong> for <strong>${safeGym}</strong> has expired. Your gym is now locked — staff and members can sign in to see existing data, but new members, classes, and bookings can't be created until you upgrade.
          </p>
          <table role="presentation"><tr><td style="background:#991b1b;border-radius:8px;">
            <a href="${safeUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:700;text-decoration:none;font-size:14px;">Upgrade to keep going</a>
          </td></tr></table>
          <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
            All your data is safe. Once you upgrade, everything continues exactly where you left off.
          </p>
        </td></tr>
        <tr><td style="padding:24px 40px 32px;">
          <div style="border-top:1px solid #e5e7eb;padding-top:20px;color:#9ca3af;font-size:12px;text-align:center;">
            Questions? Reply to this email and we'll help you pick the right plan.
          </div>
        </td></tr>
      </table>
      <div style="color:#9ca3af;font-size:12px;margin-top:20px;">&copy; ${new Date().getFullYear()} Gym Management.</div>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}

async function sendTrialExpiredEmail({ to, name, gymName, planName, upgradeUrl }) {
  const { subject, html, text } = buildTrialExpiredEmail({ name, gymName, planName, upgradeUrl });
  return sendEmail({ to, subject, html, text });
}

module.exports = {
  sendEmail,
  sendOtpEmail,
  buildOtpEmail,
  sendPasswordResetEmail,
  buildPasswordResetEmail,
  sendMemberWelcomeEmail,
  buildMemberWelcomeEmail,
  sendStaffWelcomeEmail,
  buildStaffWelcomeEmail,
  sendTrialReminderEmail,
  buildTrialReminderEmail,
  sendTrialExpiredEmail,
  buildTrialExpiredEmail,
};
