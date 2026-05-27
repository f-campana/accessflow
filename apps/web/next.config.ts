import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@accessflow/core", "@accessflow/workflow"]
};

export default nextConfig;
