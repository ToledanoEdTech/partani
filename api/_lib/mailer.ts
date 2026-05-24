/**
 * Outbound mail transport.
 *
 * Uses Google's SMTP (`smtp.gmail.com:587`, STARTTLS) authenticated with
 * a Gmail / Google Workspace App Password. This avoids third-party
 * domain verification entirely: Google already signs outgoing messages
 * with its own DKIM, and the authenticated user's domain (e.g.
 * `zvialod.com`) is implicitly trusted because the message goes through
 * Google's own MX.
 *
 * Required environment variables:
 *   SMTP_USER          – full Gmail address (e.g. partani@zvialod.com)
 *   SMTP_APP_PASSWORD  – 16-char App Password generated in
 *                        myaccount.google.com → Security → App passwords
 *                        (spaces are ignored, you can paste it either way)
 *
 * Optional:
 *   MAIL_FROM          – display-name form, e.g.
 *                        "מערכת דיווחים <partani@zvialod.com>".
 *                        Must reference the same address as SMTP_USER
 *                        (or a configured Gmail alias of it) — otherwise
 *                        Gmail will silently rewrite the From header.
 *                        Defaults to SMTP_USER.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface SmtpConfig {
  user: string;
  appPassword: string;
}

let cachedTransporter: Transporter | null = null;

function readSmtpConfig(): SmtpConfig {
  const user = process.env.SMTP_USER?.trim();
  const rawPassword = process.env.SMTP_APP_PASSWORD;
  if (!user || !rawPassword) {
    throw new Error(
      'Missing SMTP_USER or SMTP_APP_PASSWORD env vars. Set them in the Vercel project.'
    );
  }
  // Google's UI presents the App Password split into 4-char chunks for
  // readability. Strip whitespace so users can paste either format.
  return { user, appPassword: rawPassword.replace(/\s+/g, '') };
}

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  const cfg = readSmtpConfig();
  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: cfg.user, pass: cfg.appPassword },
  });
  return cachedTransporter;
}

export function resolveMailFrom(override?: string): string {
  if (override && override.trim()) return override.trim();
  const envFrom = process.env.MAIL_FROM?.trim();
  if (envFrom) return envFrom;
  return readSmtpConfig().user;
}

export interface SendMailArgs {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SendMailOk {
  ok: true;
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

export interface SendMailErr {
  ok: false;
  error: {
    name: string;
    message: string;
    code?: string;
    responseCode?: number;
  };
}

export type SendMailResult = SendMailOk | SendMailErr;

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  const transporter = getTransporter();
  const from = resolveMailFrom(args.from);
  try {
    const info = await transporter.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      headers: args.headers,
    });
    return {
      ok: true,
      messageId: info.messageId,
      accepted: (info.accepted as string[]) ?? [],
      rejected: (info.rejected as string[]) ?? [],
      response: info.response,
    };
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string; responseCode?: number };
    return {
      ok: false,
      error: {
        name: e?.name ?? 'send_error',
        message: e?.message ?? String(err),
        code: e?.code,
        responseCode: e?.responseCode,
      },
    };
  }
}
