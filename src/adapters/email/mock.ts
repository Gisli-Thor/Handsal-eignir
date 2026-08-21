/**
 * In-memory EmailAdapter mock for tests: records every message instead of
 * sending. Select with ADAPTER_EMAIL=mock.
 */
import type { EmailAdapter, EmailMessage } from "@/core/ports/email";

export class MockEmailAdapter implements EmailAdapter {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    this.sent.push(message);
    return { messageId: `mock-${this.sent.length}` };
  }

  reset(): void {
    this.sent.length = 0;
  }
}
