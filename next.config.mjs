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
  experimental: {
    outputFileTracingExcludes: {
      '*': [
        'chm_extract/**/*',
        'scripts/**/*',
        '**/*.pdf',
        '**/*.chm'
      ],
    },
  },
};

export default nextConfig;
