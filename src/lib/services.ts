/**
 * Service registry (SPEC §1.3, §2). The only place that maps adapter ports
 * (src/core/ports) to concrete implementations (src/adapters), selected via
 * ADAPTER_* env vars. Core and app code depend on the interfaces only.
 */
import type { ThjodskraAdapter } from "@/core/ports/registry";
import { MockThjodskraAdapter } from "@/adapters/registry/thjodskra.mock";

let thjodskra: ThjodskraAdapter | undefined;

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
