import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  // /api/agent-kit/:file serves these files at runtime (read with fs).
  outputFileTracingIncludes: {
    "/api/agent-kit/*": ["./agent-kit/**/*"],
  },
};
export default config;
