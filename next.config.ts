import type { NextConfig } from "next";

// Las páginas leen los datos desde el navegador (Firestore) y el servidor solo
// expone rutas API, así que no usamos Cache Components ni Partial Prefetching.
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

