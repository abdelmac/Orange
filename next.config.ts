import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "*": [
      "./uploads/**/*",
      "./.local/**/*",
      "./.env",
      "./.env.*",
      "./src/**/*",
      "./tests/**/*",
      "./scripts/**/*",
      "./prisma/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default config;
