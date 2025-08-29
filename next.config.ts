import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow base64 image data URLs
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // API timeout configuration for Vercel
  serverRuntimeConfig: {
    // Will be available on server-side
    apiTimeout: 60000, // 60 seconds
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    apiTimeout: 30000, // 30 seconds for client
  },
  // Experimental features for better performance
  experimental: {
    // Optimize for serverless
    serverMinification: true,
  }
};

export default nextConfig;
