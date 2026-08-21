/**
 * Service registry (SPEC §1.3, §2). The only place that maps adapter ports
 * (src/core/ports) to concrete implementations (src/adapters), selected via
 * ADAPTER_* env vars. Core and app code depend on the interfaces only.
 */
import type { ThjodskraAdapter } from "@/core/ports/registry";
import type { EmailAdapter } from "@/core/ports/email";
import { MockThjodskraAdapter } from "@/adapters/registry/thjodskra.mock";
import { SmtpEmailAdapter } from "@/adapters/email/smtp";
import { MockEmailAdapter } from "@/adapters/email/mock";

let thjodskra: ThjodskraAdapter | undefined;
let email: EmailAdapter | undefined;

export function getThjodskra(): ThjodskraAdapter {
  if (!thjodskra) {
    const impl = process.env.ADAPTER_THJODSKRA ?? "mock";
    switch (impl) {
      case "mock":
        thjodskra = new MockThjodskraAdapter();
        break;
      default:
        throw new Error(
          `Unknown ADAPTER_THJODSKRA="${impl}" — only "mock" exists (real adapter lands when the API agreement is signed).`,
        );
    }
  }
  return thjodskra;
}

export function getEmail(): EmailAdapter {
  if (!email) {
    const impl = process.env.ADAPTER_EMAIL ?? "smtp";
    switch (impl) {
      case "smtp":
        email = new SmtpEmailAdapter();
        break;
      case "mock":
        email = new MockEmailAdapter();
        break;
      default:
        throw new Error(
          `Unknown ADAPTER_EMAIL="${impl}" — supported: "smtp" (Mailpit in dev), "mock".`,
        );
    }
  }
  return email;
}
