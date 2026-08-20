import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/generated/**",
    ],
  },
  // Architectural boundary: the core domain must stay free of vertical- and
  // adapter-specific code. Adapter interfaces (ports) live in src/core/ports;
  // concrete implementations are injected via the service registry in src/lib.
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/verticals/*"],
              message: "Core must not import from vertical modules.",
            },
            {
              group: ["@/adapters/*"],
              message:
                "Core must not import adapter implementations. Depend on interfaces in @/core/ports instead.",
            },
            {
              group: ["@/app/*"],
              message: "Core must not import from the app (routing) layer.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
