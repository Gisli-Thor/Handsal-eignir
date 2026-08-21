/**
 * Mock portal adapter (SPEC §8): simulates 300–1500 ms latency, ~5% transient
 * failures, and occasional fake inbound leads on pull. One class, one
 * instance per portal key. The RNG and latency are injectable so tests are
 * deterministic and fast.
 */
import { randomUUID } from "node:crypto";
import {
  TransientPortalError,
  type ListingSnapshot,
  type PortalAdapter,
  type PortalLead,
  type PortalRemoteStatus,
} from "@/core/ports/portals";

const FIRST_NAMES = ["Guðrún", "Einar", "Katrín", "Ólafur", "María", "Stefán", "Elín", "Haukur"];
const LAST_NAMES = ["Jónsdóttir", "Sigurðsson", "Árnadóttir", "Kristjánsson", "Þórsdóttir", "Björnsson"];
const MESSAGES = [
  "Er hægt að fá að skoða eignina í vikunni?",
  "Óska eftir söluyfirliti og upplýsingum um afhendingartíma.",
  "Höfum mikinn áhuga — er opið hús framundan?",
  "Hvað eru húsgjöldin há? Vinsamlegast hafið samband.",
];

export interface MockPortalOptions {
  /** Return [0,1) — defaults to Math.random. Inject for deterministic tests. */
  rng?: () => number;
  /** Simulated latency range in ms; [0,0] in tests. */
  latencyMs?: [number, number];
  /** Probability of a TransientPortalError per call (default 0.05). */
  failureRate?: number;
  /** Probability that a pull yields a lead (default 0.4, then 0.25 for a 2nd). */
  leadRate?: number;
}

export class MockPortalAdapter implements PortalAdapter {
  readonly key: string;
  readonly displayName: string;
  private rng: () => number;
  private latencyMs: [number, number];
  private failureRate: number;
  private leadRate: number;

  constructor(key: string, displayName: string, options: MockPortalOptions = {}) {
    this.key = key;
    this.displayName = displayName;
    this.rng = options.rng ?? Math.random;
    this.latencyMs = options.latencyMs ?? [300, 1500];
    this.failureRate = options.failureRate ?? 0.05;
    this.leadRate = options.leadRate ?? 0.4;
  }

  private async simulateCall(): Promise<void> {
    const [min, max] = this.latencyMs;
    const delay = min + this.rng() * (max - min);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.rng() < this.failureRate) {
      throw new TransientPortalError(`${this.displayName}: tímabundin villa (mock)`);
    }
  }

  async publish(snapshot: ListingSnapshot): Promise<{ remoteId: string }> {
    await this.simulateCall();
    return { remoteId: `${this.key}-${snapshot.listingId.slice(-6)}-${randomUUID().slice(0, 8)}` };
  }

  async update(_snapshot: ListingSnapshot, _remoteId: string): Promise<void> {
    await this.simulateCall();
  }

  async unpublish(_remoteId: string): Promise<void> {
    await this.simulateCall();
  }

  async pull(_remoteId: string): Promise<{ leads: PortalLead[] }> {
    await this.simulateCall();
    const leads: PortalLead[] = [];
    let chance = this.leadRate;
    while (this.rng() < chance && leads.length < 3) {
      const first = FIRST_NAMES[Math.floor(this.rng() * FIRST_NAMES.length)];
      const last = LAST_NAMES[Math.floor(this.rng() * LAST_NAMES.length)];
      const name = `${first} ${last}`;
      leads.push({
        name,
        email: `${first.toLowerCase().replace(/[ðþæö]/g, (c) => ({ ð: "d", þ: "th", æ: "ae", ö: "o" })[c] ?? c)}.${this.key}@example.is`,
        phone: `6${Math.floor(this.rng() * 900000 + 100000)}`,
        message: MESSAGES[Math.floor(this.rng() * MESSAGES.length)],
      });
      chance = 0.25;
    }
    return { leads };
  }

  async status(_remoteId: string): Promise<PortalRemoteStatus> {
    await this.simulateCall();
    return "LIVE";
  }
}
