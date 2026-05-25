import { defineConfig, defineProject } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/generated/**",
        "src/app/**/*.tsx",
        "**/*.d.ts",
      ],
    },
    projects: [
      defineProject({
        resolve: { alias },
        test: {
          name: "node",
          globals: true,
          environment: "node",
          setupFiles: ["./__tests__/setup-node.ts"],
          include: [
            "__tests__/unit/lib/**/*.test.ts",
            "__tests__/integration/**/*.test.ts",
          ],
        },
      }),
      defineProject({
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "jsdom",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./__tests__/setup.ts"],
          include: [
            "__tests__/components/**/*.test.{ts,tsx}",
            "__tests__/unit/!(lib)/**/*.test.{ts,tsx}",
            "src/**/*.test.{ts,tsx}",
          ],
        },
      }),
    ],
  },
});
