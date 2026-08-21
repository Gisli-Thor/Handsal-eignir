/**
 * Vertical → pipeline config lookup. Mirrors src/lib/services.ts: core stays
 * vertical-agnostic; only this composition layer knows the concrete configs.
 * The Bílar config is scaffolded in M6.
 */
import type { PipelineConfig } from "@/core/pipeline/types";
import { eignirPipeline } from "@/verticals/eignir/pipeline";

export function getPipeline(vertical: "EIGNIR" | "BILAR"): PipelineConfig {
  switch (vertical) {
    case "EIGNIR":
      return eignirPipeline;
    case "BILAR":
      throw new Error("The Bílar pipeline is scaffolded in milestone M6.");
  }
}
