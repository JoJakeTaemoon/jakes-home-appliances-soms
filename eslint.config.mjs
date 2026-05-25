import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Server-only modules. Importing these from a client component drags Node
// built-ins (`node:module`, `pg`) into the browser bundle and breaks the
// Turbopack production build.
const SERVER_ONLY_IMPORTS = [
  {
    name: "@/lib/prisma",
    message:
      "Server-only. Importing from a client component drags `pg` and `node:module` into the client bundle (Turbopack will fail to build).",
  },
  {
    name: "@/lib/auth/permissions",
    message:
      "Server-only — uses Prisma. For pure-sync verbs (e.g. canReassignSiteManager), import from `@/lib/auth/roles` instead.",
  },
  {
    name: "@/lib/action-log",
    message: "Server-only — writes to the DB.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx", "src/hooks/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: SERVER_ONLY_IMPORTS }],
    },
  },
  {
    // Server-side code (API routes, server libs) is allowed to import these.
    files: [
      "src/app/api/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "src/middleware.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
