/**
 * Mock ÞjóðskráAdapter (SPEC §4). Never calls a real API.
 *
 * Behavior:
 *  - documented test kennitölur below return fixed persons
 *  - KT_UNAVAILABLE simulates a transient upstream failure (for retry UX)
 *  - any other checksum-valid kennitala returns a deterministically generated
 *    fake person (same kennitala → same person, across restarts)
 *  - invalid checksum → InvalidKennitalaError
 *  - simulated latency, deterministic per kennitala
 */
import {
  isValidKennitala,
  kennitalaType,
  normalizeKennitala,
} from "@/core/contacts/kennitala";
import {
  InvalidKennitalaError,
  RegistryUnavailableError,
  type RegistryPerson,
  type ThjodskraAdapter,
} from "@/core/ports/registry";

/** Documented test kennitölur (all checksum-valid). */
export const TEST_KENNITOLUR = {
  /** Gervimaður Ameríka — fixed person */
  AMERIKA: "0101302989",
  /** Gervimaður Útlönd — fixed person */
  UTLOND: "0101302399",
  /** Gervimaður Afríka — fixed person */
  AFRIKA: "0101303019",
  /** Gervifélag ehf. — fixed company */
  FELAG: "4101302979",
  /** Always throws RegistryUnavailableError (simulated outage) */
  UNAVAILABLE: "0101305069",
} as const;

const FIXED_PERSONS: Record<string, RegistryPerson> = {
  [TEST_KENNITOLUR.AMERIKA]: {
    kennitala: TEST_KENNITOLUR.AMERIKA,
    name: "Gervimaður Ameríka",
    legalDomicile: { address: "Vesturgata 3", postalCode: "101", city: "Reykjavík" },
  },
  [TEST_KENNITOLUR.UTLOND]: {
    kennitala: TEST_KENNITOLUR.UTLOND,
    name: "Gervimaður Útlönd",
    legalDomicile: { address: "Austurstræti 12", postalCode: "101", city: "Reykjavík" },
  },
  [TEST_KENNITOLUR.AFRIKA]: {
    kennitala: TEST_KENNITOLUR.AFRIKA,
    name: "Gervimaður Afríka",
    legalDomicile: { address: "Hafnarstræti 90", postalCode: "600", city: "Akureyri" },
  },
  [TEST_KENNITOLUR.FELAG]: {
    kennitala: TEST_KENNITOLUR.FELAG,
    name: "Gervifélag ehf.",
    legalDomicile: { address: "Borgartún 26", postalCode: "105", city: "Reykjavík" },
  },
};

const FIRST_NAMES = [
  "Guðrún", "Sigríður", "Kristín", "Anna", "Helga", "Margrét", "Elín", "Katrín",
  "Jón", "Sigurður", "Guðmundur", "Gunnar", "Ólafur", "Einar", "Magnús", "Stefán",
];
const PARENT_NAMES = [
  "Jón", "Sigurð", "Guðmund", "Ólaf", "Einar", "Magnús", "Stefán", "Gunnar",
  "Björn", "Árni", "Kristján", "Halldór", "Pétur", "Ragnar", "Þór", "Helg",
];
const STREETS = [
  "Laugavegur", "Skólavörðustígur", "Hverfisgata", "Njálsgata", "Grettisgata",
  "Miklabraut", "Sólvallagata", "Álfheimar", "Langholtsvegur", "Kársnesbraut",
  "Hafnargata", "Strandgata", "Túngata", "Aðalstræti", "Brekkugata", "Heiðarvegur",
];
const PLACES: Array<{ postalCode: string; city: string }> = [
  { postalCode: "101", city: "Reykjavík" },
  { postalCode: "105", city: "Reykjavík" },
  { postalCode: "108", city: "Reykjavík" },
  { postalCode: "200", city: "Kópavogur" },
  { postalCode: "220", city: "Hafnarfjörður" },
  { postalCode: "600", city: "Akureyri" },
  { postalCode: "800", city: "Selfoss" },
  { postalCode: "230", city: "Reykjanesbær" },
];
const COMPANY_WORDS = [
  "Björg", "Klettur", "Straumur", "Foss", "Hraun", "Vík", "Borg", "Eyja",
  "Jökull", "Drangur", "Bakki", "Höfði", "Mörk", "Ás", "Tindur", "Nes",
];
const COMPANY_SUFFIXES = ["ehf.", "hf.", "slf."];

/** Small deterministic hash (FNV-1a) so the same kennitala always maps to the
 * same fake person. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: number, salt: number): T {
  return items[(seed ^ Math.imul(salt, 2654435761)) % items.length];
}

function generatePerson(kennitala: string): RegistryPerson {
  const seed = fnv1a(kennitala);
  const place = pick(PLACES, seed, 4);
  const houseNumber = (seed % 98) + 1;
  const address = `${pick(STREETS, seed, 3)} ${houseNumber}`;

  if (kennitalaType(kennitala) === "COMPANY") {
    return {
      kennitala,
      name: `${pick(COMPANY_WORDS, seed, 1)} ${pick(COMPANY_SUFFIXES, seed, 2)}`,
      legalDomicile: { address, postalCode: place.postalCode, city: place.city },
    };
  }

  const first = pick(FIRST_NAMES, seed, 1);
  // Icelandic patronymic: -dóttir for names in the first half of the list
  // (female names), -son otherwise. Purely cosmetic for fake data.
  const suffix = FIRST_NAMES.indexOf(first) < FIRST_NAMES.length / 2 ? "sdóttir" : "sson";
  return {
    kennitala,
    name: `${first} ${pick(PARENT_NAMES, seed, 2)}${suffix}`,
    legalDomicile: { address, postalCode: place.postalCode, city: place.city },
  };
}

export interface MockThjodskraOptions {
  /** Simulated latency bounds in ms; pass 0/0 in tests. */
  minLatencyMs?: number;
  maxLatencyMs?: number;
}

export class MockThjodskraAdapter implements ThjodskraAdapter {
  private readonly minLatencyMs: number;
  private readonly maxLatencyMs: number;

  constructor(options: MockThjodskraOptions = {}) {
    this.minLatencyMs = options.minLatencyMs ?? 200;
    this.maxLatencyMs = options.maxLatencyMs ?? 700;
  }

  async lookupPerson(kennitala: string): Promise<RegistryPerson | null> {
    const kt = normalizeKennitala(kennitala);
    if (!isValidKennitala(kt)) throw new InvalidKennitalaError(kt);

    await this.simulateLatency(kt);
    if (kt === TEST_KENNITOLUR.UNAVAILABLE) {
      throw new RegistryUnavailableError("Þjóðskrá (mock): simulated outage");
    }
    return FIXED_PERSONS[kt] ?? generatePerson(kt);
  }

  private async simulateLatency(kt: string): Promise<void> {
    const span = Math.max(0, this.maxLatencyMs - this.minLatencyMs);
    const ms = this.minLatencyMs + (span === 0 ? 0 : fnv1a(kt) % span);
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
