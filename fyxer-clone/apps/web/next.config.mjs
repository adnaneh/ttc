import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['*'] } },
  // Point tracing root to the monorepo root to avoid lockfile confusion
  outputFileTracingRoot: path.join(__dirname, '..', '..')
};
export default nextConfig;
