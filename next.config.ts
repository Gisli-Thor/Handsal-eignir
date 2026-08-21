import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  // @react-pdf/renderer ships its own react-reconciler and node-only code —
  // keep it external to the server bundle (Turbopack + webpack both honor
  // this; standalone output still traces it into the image).
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default withNextIntl(nextConfig);
