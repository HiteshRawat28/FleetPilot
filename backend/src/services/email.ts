const provider = (process.env.EMAIL_PROVIDER || (process.env.NODE_ENV === 'production' ? 'resend' : 'console')).toLowerCase();
const from = process.env.EMAIL_FROM || '';
const resendApiKey = process.env.RESEND_API_KEY || '';

export type PasswordResetEmail = {
  recipient: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
  idempotencyKey: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

export function assertEmailConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  if (provider !== 'resend') throw new Error('EMAIL_PROVIDER must be resend in production');
  if (!from || !resendApiKey) throw new Error('EMAIL_FROM and RESEND_API_KEY are required in production');
}

export async function sendPasswordResetEmail(input: PasswordResetEmail) {
  if (provider === 'console') {
    if (process.env.NODE_ENV === 'production') throw new Error('Console email transport is disabled in production');
    console.info(`[password-reset:development] recipient=${input.recipient} url=${input.resetUrl}`);
    return;
  }
  if (provider !== 'resend') throw new Error(`Unsupported email provider: ${provider}`);
  if (!from || !resendApiKey) throw new Error('Resend email delivery is not configured');

  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.resetUrl);
  const text = `Hello ${input.name},\n\nUse this link to reset your FleetPilot password:\n${input.resetUrl}\n\nThis link expires in ${input.expiresInMinutes} minutes and can only be used once. If you did not request this, you can ignore this email.`;
  const html = `<p>Hello ${safeName},</p><p>We received a request to reset your FleetPilot password.</p><p><a href="${safeUrl}">Reset your password</a></p><p>This link expires in ${input.expiresInMinutes} minutes and can only be used once. If you did not request this, you can ignore this email.</p>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({ from, to: [input.recipient], subject: 'Reset your FleetPilot password', text, html }),
  });
  if (!response.ok) throw new Error(`Password reset email delivery failed with status ${response.status}`);
}
