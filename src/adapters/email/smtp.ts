/**
 * SMTP EmailAdapter — Mailpit in dev (docker-compose, web UI on :8025), any
 * SMTP relay in production. Configuration via SMTP_* env vars (.env.example).
 */
import { createTransport, type Transporter } from "nodemailer";
import type { EmailAdapter, EmailMessage } from "@/core/ports/email";

export class SmtpEmailAdapter implements EmailAdapter {
  private transporter: Transporter;
  private from: string;

  constructor() {
    const host = process.env.SMTP_HOST ?? "localhost";
    const port = Number(process.env.SMTP_PORT ?? 1025);
    const user = process.env.SMTP_USER || undefined;
    const password = process.env.SMTP_PASSWORD || undefined;
    this.from = process.env.SMTP_FROM ?? "Handsal <noreply@handsal.local>";
    this.transporter = createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
    return { messageId: String(info.messageId ?? "") };
  }
}
