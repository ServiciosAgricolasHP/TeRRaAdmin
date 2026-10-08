import { defineConfig } from "vitest/config";

// Tests de `firestore.rules` contra el emulador de Firestore
// (`npm run test:rules`).
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/rules/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
