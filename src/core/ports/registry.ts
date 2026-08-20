/**
 * Registry ports (SPEC §2 folder structure, §4 Þjóðskrá lookup).
 *
 * Interfaces only — concrete implementations live in src/adapters/registry
 * and are selected via the service registry in src/lib/services.ts.
 * BifreiðaskráAdapter is scaffolded in M6.
 */

/** A person or legal entity as returned by the national registry. */
export interface RegistryPerson {
  kennitala: string;
  name: string;
  /** Lögheimili */
  legalDomicile: {
    address: string;
    postalCode: string;
    city: string;
  };
}

/** Transient upstream failure (network, maintenance). Callers may retry. */
export class RegistryUnavailableError extends Error {
  constructor(message = "Registry service unavailable") {
    super(message);
    this.name = "RegistryUnavailableError";
  }
}

/** The kennitala failed structural/checksum validation — not a lookup miss. */
export class InvalidKennitalaError extends Error {
  constructor(public readonly kennitala: string) {
    super(`Invalid kennitala: ${kennitala}`);
    this.name = "InvalidKennitalaError";
  }
}

export interface ThjodskraAdapter {
  /**
   * Look up a person (or company) by kennitala.
   *
   * Every call MUST be audit-logged at the call site (who, when, which
   * kennitala, purpose) — a compliance requirement of Þjóðskrá access
   * agreements (SPEC §4). Throws {@link InvalidKennitalaError} on a bad
   * checksum and {@link RegistryUnavailableError} on transient failure;
   * returns null only when the registry has no record.
   */
  lookupPerson(kennitala: string): Promise<RegistryPerson | null>;
}
