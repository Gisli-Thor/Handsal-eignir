/**
 * Icelandic locale formatting (SPEC §1.5). Implemented by hand rather than
 * via Intl so output is deterministic regardless of the runtime's ICU data:
 *   currency  12.345.678 kr.   (dot thousands separator, no decimals)
 *   dates     24.7.2026        (no leading zeros)
 *   areas     123,4 m²         (comma decimal separator, one decimal)
 */

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatISK(amount: number): string {
  if (!Number.isFinite(amount)) return "–";
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${groupThousands(String(Math.abs(rounded)))} kr.`;
}

export function formatDate(date: Date): string {
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

export function formatDateTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)} kl. ${hh}:${mm}`;
}

export function formatArea(squareMeters: number): string {
  if (!Number.isFinite(squareMeters)) return "–";
  const sign = squareMeters < 0 ? "-" : "";
  const abs = Math.abs(squareMeters);
  const fixed = abs.toFixed(1);
  const [intPart, decPart] = fixed.split(".");
  return `${sign}${groupThousands(intPart)},${decPart} m²`;
}
