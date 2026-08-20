/** Display helpers for Handsal Eignir properties. */

export interface AddressLike {
  gotuheiti: string;
  husnumer: string;
  ibud?: string | null;
}

export function propertyAddressLine(property: AddressLike): string {
  const base = `${property.gotuheiti} ${property.husnumer}`;
  return property.ibud ? `${base}, ${property.ibud}` : base;
}

/** Eignir pipeline stage keys (engine lands in M3; keys are stable now). */
export const EIGNIR_STAGES = [
  "UNDIRBUNINGUR",
  "I_SOLU",
  "TILBOD_MOTTEKID",
  "TILBOD_SAMTHYKKT",
  "KAUPSAMNINGUR",
  "AFHENDING",
  "AFSAL_LOKID",
  "FALLID_FRA",
] as const;

export type EignirStage = (typeof EIGNIR_STAGES)[number];
