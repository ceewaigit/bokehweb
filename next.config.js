/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config, { isServer }) => {
    config.externals = [...config.externals, 'electron'];
    
    // Fix Konva node/browser issue
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'konva/lib/index-node.js': 'konva/lib/index.js',
      };
    }
    
    return config;
  },
}

module.exports = nextConfig