import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://packshield.app",
  output: "static",
  build: {
    format: "file"
  }
});
