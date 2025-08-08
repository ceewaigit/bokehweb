/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.externals = [...config.externals, 'electron'];
    return config;
  },
}

module.exports = nextConfig