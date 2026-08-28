import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // The reader runs inside a WebView, so its text index is DOM code and its
    // tests need a DOM. jsdom reports zero-size rects, so geometry assertions
    // are made on selected TEXT and on the scale factor rather than on pixel
    // values — real-pixel verification happens in the browser harness.
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
  },
});
