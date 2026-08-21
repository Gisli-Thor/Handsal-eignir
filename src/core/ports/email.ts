/**
 * Email port (SPEC §2 adapters). Implementations live in src/adapters/email
 * (SMTP → Mailpit in dev, in-memory mock for tests) and are selected via the
 * service registry in src/lib/services.ts (ADAPTER_EMAIL).
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}
