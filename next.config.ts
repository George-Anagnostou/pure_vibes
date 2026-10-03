import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // /api/agent-kit/:file serves these files at runtime (read with fs).
  outputFileTracingIncludes: {
    "/api/agent-kit/*": ["./agent-kit/**/*"],
  },
};
export default config;
