/**
 * Icelandic söluþóknun disclosure line for the söluyfirlit (SPEC §9/§10),
 * generated from the effective scheme when no explicit soluthoknunText is
 * set. Phrasing modeled on the legacy-system examples (examples/NOTES.md):
 * amounts ex-VSK with "auk vsk.".
 */
import { formatISK } from "@/lib/format";
import type { CommissionScheme } from "./scheme";

function pct(value: number): string {
  return `${String(value).replace(".", ",")}%`;
}

function isk(digits: string): string {
  return formatISK(Number(digits));
}

export function describeSchemeIs(scheme: CommissionScheme): string {
  let main: string;
  switch (scheme.type) {
    case "FIXED_PERCENT":
      main = `Söluþóknun er ${pct(scheme.percent)} af söluverði, auk vsk.`;
      break;
    case "FLAT_PLUS_PERCENT":
      main = `Söluþóknun er ${isk(scheme.flatISK)} auk ${pct(scheme.percent)} af söluverði, auk vsk.`;
      break;
    case "TIERED": {
      const parts = scheme.tiers.map((tier, index) => {
        if (index === 0 && tier.uptoISK !== null) {
          return `${pct(tier.percent)} af fyrstu ${isk(tier.uptoISK)}`;
        }
        if (tier.uptoISK === null) {
          return `${pct(tier.percent)} af því sem umfram er`;
        }
        return `${pct(tier.percent)} að ${isk(tier.uptoISK)}`;
      });
      main = `Söluþóknun er þrepaskipt: ${parts.join(" og ")}, auk vsk.`;
      break;
    }
  }
  if (scheme.lineItems.length === 0) return main;
  const items = scheme.lineItems
    .map((item) => `${item.label} ${isk(item.amountISK)}`)
    .join(" og ");
  return `${main} Auk þess greiðist ${items}, auk vsk.`;
}
