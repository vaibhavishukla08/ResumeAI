/**
 * Outbound mail for verification and password-reset links.
 *
 * No SMTP dependency is bundled. With none configured the message is written
 * to the server log, which keeps local development working without turning
 * "unconfigured" into "silently broken" — the link is right there in the
 * console. In production, point MAIL_WEBHOOK_URL at your provider.
 *
 * Delivery failure is never surfaced to the caller of an auth route: telling
 * an anonymous user whether mail was sent to an address is an account
 * enumeration oracle.
 */

const APP_NAME = 'ResumeAI';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@resumeai.local';
const MAIL_WEBHOOK_URL = process.env.MAIL_WEBHOOK_URL || '';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(MAIL_WEBHOOK_URL);
}

async function deliver(mail: Mail): Promise<void> {
  if (!MAIL_WEBHOOK_URL) {
    console.log(
      `\n──────── mail (no provider configured, logging instead) ────────\n` +
        `to:      ${mail.to}\n` +
        `subject: ${mail.subject}\n\n${mail.text}\n` +
        `────────────────────────────────────────────────────────────────\n`,
    );
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(MAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, ...mail }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`mail webhook returned ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send without making the caller wait or fail. Auth routes must respond in
 * constant time regardless of whether an address exists or the provider is up.
 */
export function sendInBackground(mail: Mail): void {
  void deliver(mail).catch((err: Error) => {
    console.error(`[mail] delivery to ${mail.to} failed:`, err.message);
  });
}

export function sendVerificationEmail(to: string, name: string, token: string): void {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  sendInBackground({
    to,
    subject: `Confirm your ${APP_NAME} email address`,
    text:
      `Hi ${name},\n\n` +
      `Confirm this address to finish setting up your ${APP_NAME} workspace:\n\n` +
      `${link}\n\n` +
      `The link expires in 24 hours.\n\n` +
      `If you did not create this account you can ignore this email — the\n` +
      `address will not be used until it is confirmed.\n`,
  });
}

export function sendPasswordResetEmail(to: string, name: string, token: string): void {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  sendInBackground({
    to,
    subject: `Reset your ${APP_NAME} password`,
    text:
      `Hi ${name},\n\n` +
      `Use this link to choose a new password:\n\n` +
      `${link}\n\n` +
      `The link expires in 1 hour and can only be used once.\n\n` +
      `If you did not ask for this, no action is needed — your current\n` +
      `password still works and nobody has been given access.\n`,
  });
}

/**
 * Sent when someone tries to register an address that already has an account.
 * This is what lets the register route return the same response either way:
 * the real owner is told, and the person probing learns nothing.
 */
export function sendDuplicateRegistrationEmail(to: string, name: string): void {
  sendInBackground({
    to,
    subject: `Someone tried to register with your ${APP_NAME} email`,
    text:
      `Hi ${name},\n\n` +
      `Somebody just tried to create a ${APP_NAME} account with this address.\n` +
      `You already have one, so nothing was created and nothing has changed.\n\n` +
      `If it was you, sign in instead: ${APP_URL}/signin\n` +
      `If you have forgotten your password, reset it there.\n`,
  });
}

/** Sent after a password changes, so an unexpected change is visible. */
export function sendPasswordChangedEmail(to: string, name: string): void {
  sendInBackground({
    to,
    subject: `Your ${APP_NAME} password was changed`,
    text:
      `Hi ${name},\n\n` +
      `Your ${APP_NAME} password was just changed and all other sessions were\n` +
      `signed out.\n\n` +
      `If this was not you, reset your password immediately at\n` +
      `${APP_URL}/signin and review who has access to your email account.\n`,
  });
}
