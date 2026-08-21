import { describe, expect, it } from "vitest";
import { iskInWords } from "@/core/format/isk-words";

describe("iskInWords", () => {
  it("matches the real kauptilboð examples (examples/NOTES.md)", () => {
    // Kauptilboð Hafnarbraut 10: 89.990.000 kr.
    expect(iskInWords(89_990_000n)).toBe(
      "Áttatíuogníumilljónirníuhundruðogníutíuþúsund",
    );
    // Gagntilboð Þórufell: 41.900.000 kr.
    expect(iskInWords(41_900_000n)).toBe("Fjörutíuogeinmilljónníuhundruðþúsund");
  });

  it("uses singular scale words for segments ending in 1 (not 11)", () => {
    expect(iskInWords(1_000_000n)).toBe("Einmilljón");
    expect(iskInWords(21_000_000n)).toBe("Tuttuguogeinmilljón");
    expect(iskInWords(11_000_000n)).toBe("Ellefumilljónir");
    expect(iskInWords(1_000_000_000n)).toBe("Einnmilljarður");
    expect(iskInWords(2_000_000_000n)).toBe("Tveirmilljarðar");
  });

  it("genders unit words by the counted noun", () => {
    expect(iskInWords(2_000_000n)).toBe("Tværmilljónir"); // milljón feminine
    expect(iskInWords(2_000n)).toBe("Tvöþúsund"); // þúsund neuter
    expect(iskInWords(4_000n)).toBe("Fjögurþúsund");
    expect(iskInWords(2n)).toBe("Tvær"); // krónur feminine
  });

  it("places og before the last component of a segment", () => {
    expect(iskInWords(999n)).toBe("Níuhundruðníutíuogníu");
    expect(iskInWords(990n)).toBe("Níuhundruðogníutíu");
    expect(iskInWords(905n)).toBe("Níuhundruðogfimm");
    expect(iskInWords(915n)).toBe("Níuhundruðogfimmtán");
    expect(iskInWords(89n)).toBe("Áttatíuogníu");
  });

  it("handles hundreds pluralization and zero", () => {
    expect(iskInWords(100n)).toBe("Eitthundrað");
    expect(iskInWords(300n)).toBe("Þrjúhundruð");
    expect(iskInWords(0n)).toBe("Núll");
  });

  it("composes full amounts across scales", () => {
    expect(iskInWords(62_500_000n)).toBe("Sextíuogtværmilljónirfimmhundruðþúsund");
    expect(iskInWords(1_234_567n)).toBe(
      "Einmilljóntvöhundruðþrjátíuogfjögurþúsundfimmhundruðsextíuogsjö",
    );
  });

  it("rejects negatives", () => {
    expect(() => iskInWords(-1n)).toThrow();
  });
});
