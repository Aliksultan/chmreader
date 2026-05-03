/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  serverExternalPackages: ['pdf2json', 'pdf-parse'],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.js',
    },
  },
};

export default nextConfig;
