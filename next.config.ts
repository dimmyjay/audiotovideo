import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase API request body size limit (for large audio uploads)
  api: {
    bodyParser: {
      sizeLimit: "32mb", // or higher if needed
    },
  },
};

export default nextConfig;