import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each test file runs in its own context; we want deterministic, sequential output
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    // Replays can take a moment — generous timeout
    testTimeout: 30_000,
  },
});
