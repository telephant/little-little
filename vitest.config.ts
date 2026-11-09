import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    testTimeout: 12000, // autosave debounce (1s) + CPU load from the dev app made 3s waits flaky
    css: { include: [/App\.css/] },
  },
});
