/**
 * Service registry (SPEC §1.3, §2). The only place that maps adapter ports
 * (src/core/ports) to concrete implementations (src/adapters), selected via
 * ADAPTER_* env vars. Core and app code depend on the interfaces only.
 */
import type { ThjodskraAdapter } from "@/core/ports/registry";
import type { EmailAdapter } from "@/core/ports/email";
import type { PortalAdapter } from "@/core/ports/portals";
import type { SigningAdapter } from "@/core/ports/signing";
import { MockThjodskraAdapter } from "@/adapters/registry/thjodskra.mock";
import { SmtpEmailAdapter } from "@/adapters/email/smtp";
import { MockEmailAdapter } from "@/adapters/email/mock";
import { MockPortalAdapter } from "@/adapters/portals/mock";
import { MockSigningAdapter } from "@/adapters/signing/mock";

let thjodskra: ThjodskraAdapter | undefined;
let email: EmailAdapter | undefined;
let portals: Record<"EIGNIR" | "BILAR", PortalAdapter[]> | undefined;
let signing: SigningAdapter | undefined;

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

/** Per-vertical portal registrations (SPEC §8). Bílar lands in M6. */
export function getPortalAdapters(vertical: "EIGNIR" | "BILAR"): PortalAdapter[] {
  if (!portals) {
    const impl = process.env.ADAPTER_PORTALS ?? "mock";
    if (impl !== "mock") {
      throw new Error(
        `Unknown ADAPTER_PORTALS="${impl}" — only "mock" exists (real adapters land when portal API agreements are signed).`,
      );
    }
    portals = {
      EIGNIR: [
        new MockPortalAdapter("fasteignir", "fasteignir.is"),
        new MockPortalAdapter("mbl-fasteignir", "mbl.is/fasteignir"),
        new MockPortalAdapter("fasteignaleitin", "fasteignaleitin.is"),
      ],
      BILAR: [new MockPortalAdapter("bilasolur", "bilasolur.is")],
    };
  }
  return portals[vertical];
}

export function getSigning(): SigningAdapter {
  if (!signing) {
    const impl = process.env.ADAPTER_SIGNING ?? "mock";
    if (impl !== "mock") {
      throw new Error(
        `Unknown ADAPTER_SIGNING="${impl}" — only "mock" exists (real provider lands when the agreement is signed).`,
      );
    }
    signing = new MockSigningAdapter();
  }
  return signing;
}
