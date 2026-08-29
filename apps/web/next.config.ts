import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: [
    "@bookmark-platform/domain",
    "@bookmark-platform/schemas",
    "@bookmark-platform/storage",
    "@bookmark-platform/storage-indexeddb",
    "@bookmark-platform/sync",
  ],
};
export default nextConfig;
