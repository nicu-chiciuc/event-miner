import { defineConfig } from "vite";

const pages = [
  "index.html",
  "prototype/index.html",
  "experiments/dive/index.html",
  "experiments/sand/index.html",
  "experiments/chain/index.html",
];

export default defineConfig({
  server: { port: 5291 },
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page.replace(/\/?index\.html$/, "") || "hub", new URL(page, import.meta.url).pathname])),
    },
  },
});
