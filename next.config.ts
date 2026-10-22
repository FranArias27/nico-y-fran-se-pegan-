import type { NextConfig } from "next";

// El prototipo corre 100 % en el navegador (datos en IndexedDB), así que no
// usamos Cache Components ni Partial Prefetching: no hay datos del servidor.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
