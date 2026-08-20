/**
 * Kennitala (Icelandic national ID) validation — SPEC §4.
 *
 * Format: DDMMYY-NNCX where
 *   DD    day of birth (persons) or day + 40 (companies)
 *   MM    month
 *   YY    year within century
 *   NN    serial number
 *   C     check digit (mod-11 over the first 8 digits, weights 3,2,7,6,5,4,3,2)
 *   X     century digit: 8 = 1800s, 9 = 1900s, 0 = 2000s
 */

const CHECKSUM_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

export type KennitalaType = "PERSON" | "COMPANY";

/** Strip spaces and hyphens: "010130-2989" → "0101302989". */
export function normalizeKennitala(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/** "0101302989" → "010130-2989" for display. */
export function formatKennitala(input: string): string {
  const kt = normalizeKennitala(input);
  return kt.length === 10 ? `${kt.slice(0, 6)}-${kt.slice(6)}` : input;
}

/**
 * Mod-11 check digit for the first 8 digits, or null when the checksum
 * has no valid digit (remainder 1 → digit "10" — such serials are skipped
 * when kennitölur are issued).
 */
export function kennitalaCheckDigit(first8: string): number | null {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(first8[i]) * CHECKSUM_WEIGHTS[i];
  }
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  return check === 10 ? null : check;
}

export function isValidKennitala(input: string): boolean {
  const kt = normalizeKennitala(input);
  if (!/^\d{10}$/.test(kt)) return false;

  const day = Number(kt.slice(0, 2));
  const month = Number(kt.slice(2, 4));
  const century = kt[9];
  const personDay = day > 40 ? day - 40 : day;

  if (personDay < 1 || personDay > 31) return false;
  if (month < 1 || month > 12) return false;
  if (century !== "8" && century !== "9" && century !== "0") return false;

  return kennitalaCheckDigit(kt.slice(0, 8)) === Number(kt[8]);
}

/** PERSON or COMPANY (companies register day-of-month + 40). Assumes valid. */
export function kennitalaType(input: string): KennitalaType {
  const day = Number(normalizeKennitala(input).slice(0, 2));
  return day > 40 ? "COMPANY" : "PERSON";
}
