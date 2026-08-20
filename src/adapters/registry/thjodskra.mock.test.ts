import { describe, expect, it } from "vitest";
import {
  InvalidKennitalaError,
  RegistryUnavailableError,
} from "@/core/ports/registry";
import {
  MockThjodskraAdapter,
  TEST_KENNITOLUR,
} from "@/adapters/registry/thjodskra.mock";

const adapter = new MockThjodskraAdapter({ minLatencyMs: 0, maxLatencyMs: 0 });

describe("MockThjodskraAdapter", () => {
  it("returns fixed persons for documented test kennitölur", async () => {
    const person = await adapter.lookupPerson(TEST_KENNITOLUR.AMERIKA);
    expect(person).toEqual({
      kennitala: "0101302989",
      name: "Gervimaður Ameríka",
      legalDomicile: { address: "Vesturgata 3", postalCode: "101", city: "Reykjavík" },
    });
  });

  it("returns a fixed company for the company test kennitala", async () => {
    const company = await adapter.lookupPerson(TEST_KENNITOLUR.FELAG);
    expect(company?.name).toBe("Gervifélag ehf.");
  });

  it("accepts hyphenated input and normalizes the result", async () => {
    const person = await adapter.lookupPerson("010130-2989");
    expect(person?.kennitala).toBe("0101302989");
  });

  it("generates a deterministic fake person for unknown valid kennitölur", async () => {
    const kt = "1203803039"; // checksum-valid, not in the fixed set
    const a = await adapter.lookupPerson(kt);
    const b = await adapter.lookupPerson(kt);
    expect(a).toEqual(b);
    expect(a?.kennitala).toBe(kt);
    expect(a?.name).toMatch(/^\S+ \S+(sson|sdóttir)$/u);
    expect(a?.legalDomicile.postalCode).toMatch(/^\d{3}$/);
  });

  it("generates a company name for unknown valid company kennitölur", async () => {
    const result = await adapter.lookupPerson("5810802989");
    expect(result?.name).toMatch(/ (ehf\.|hf\.|slf\.)$/);
  });

  it("throws InvalidKennitalaError on a bad checksum", async () => {
    await expect(adapter.lookupPerson("0101302999")).rejects.toBeInstanceOf(
      InvalidKennitalaError,
    );
  });

  it("simulates an outage for the documented unavailable kennitala", async () => {
    await expect(
      adapter.lookupPerson(TEST_KENNITOLUR.UNAVAILABLE),
    ).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});
