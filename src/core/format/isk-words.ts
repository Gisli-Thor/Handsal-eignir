/**
 * ISK amounts in Icelandic words for legal documents (kauptilboð
 * "Heildarverð í bókstöfum" — see examples/NOTES.md). Real documents write
 * the amount as one concatenated word:
 *   89.990.000 → "Áttatíuogníumilljónirníuhundruðogníutíuþúsund"
 *   41.900.000 → "Fjörutíuogeinmilljónníuhundruðþúsund"
 *
 * Grammar: unit words are gendered by the counted noun (milljarður masc.,
 * milljón fem., þúsund/hundrað neut.); a segment ending in 1 (but not 11)
 * takes the singular scale word; "og" is inserted before the last component
 * of each three-digit segment.
 */

type Gender = "masculine" | "feminine" | "neuter";

const UNITS: Record<Gender, string[]> = {
  masculine: ["", "einn", "tveir", "þrír", "fjórir", "fimm", "sex", "sjö", "átta", "níu"],
  feminine: ["", "ein", "tvær", "þrjár", "fjórar", "fimm", "sex", "sjö", "átta", "níu"],
  neuter: ["", "eitt", "tvö", "þrjú", "fjögur", "fimm", "sex", "sjö", "átta", "níu"],
};

const TEENS = [
  "tíu", "ellefu", "tólf", "þrettán", "fjórtán",
  "fimmtán", "sextán", "sautján", "átján", "nítján",
];

const TENS = [
  "", "", "tuttugu", "þrjátíu", "fjörutíu",
  "fimmtíu", "sextíu", "sjötíu", "áttatíu", "níutíu",
];

/** 1–99 in words, gendered final unit. */
function tensWords(n: number, gender: Gender): string {
  if (n < 10) return UNITS[gender][n];
  if (n < 20) return TEENS[n - 10];
  const tens = TENS[Math.floor(n / 10)];
  const unit = n % 10;
  return unit === 0 ? tens : `${tens}og${UNITS[gender][unit]}`;
}

/** 1–999 in words; "og" before the last component. */
function segmentWords(n: number, gender: Gender): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return tensWords(rest, gender);
  const hundredWord = `${UNITS.neuter[hundreds]}${hundreds === 1 ? "hundrað" : "hundruð"}`;
  if (rest === 0) return hundredWord;
  // "og" joins the hundred part to the rest only when the rest is a single
  // component with no internal "og" of its own: níuhundruðogníutíu (990)
  // vs níuhundruðníutíuogníu (999).
  const restWord = tensWords(rest, gender);
  return restWord.includes("og")
    ? `${hundredWord}${restWord}`
    : `${hundredWord}og${restWord}`;
}

/** True when a segment takes the singular scale word (ends in 1, not 11). */
function isSingular(n: number): boolean {
  return n % 10 === 1 && n % 100 !== 11;
}

/**
 * Whole ISK amount in words, first letter capitalized, no currency suffix.
 * Supports up to 999 milljarðar.
 */
export function iskInWords(amount: bigint | number): string {
  let n = typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));
  if (n < 0n) throw new Error("iskInWords: negative amounts are not supported");
  if (n === 0n) return "Núll";

  const billions = Number(n / 1_000_000_000n);
  n %= 1_000_000_000n;
  const millions = Number(n / 1_000_000n);
  n %= 1_000_000n;
  const thousands = Number(n / 1_000n);
  const rest = Number(n % 1_000n);

  const parts: string[] = [];
  if (billions > 0) {
    parts.push(
      `${segmentWords(billions, "masculine")}${isSingular(billions) ? "milljarður" : "milljarðar"}`,
    );
  }
  if (millions > 0) {
    parts.push(
      `${segmentWords(millions, "feminine")}${isSingular(millions) ? "milljón" : "milljónir"}`,
    );
  }
  if (thousands > 0) {
    parts.push(`${segmentWords(thousands, "neuter")}þúsund`);
  }
  if (rest > 0) {
    parts.push(segmentWords(rest, "feminine")); // krónur are feminine
  }
  const word = parts.join("");
  return word.charAt(0).toUpperCase() + word.slice(1);
}
