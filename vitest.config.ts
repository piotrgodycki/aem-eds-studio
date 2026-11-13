import { defineConfig } from "vitest/config";

// Tests live in tests/; vite.config.ts roots the UI build at src/web.
export default defineConfig({ test: { root: ".", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] } });
