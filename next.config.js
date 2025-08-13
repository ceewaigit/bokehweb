/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config, { isServer, webpack }) => {
    config.externals = [...config.externals, 'electron'];
    
    // Completely ignore canvas for both server and client
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^canvas$/
      })
    );
    
    return config;
  },
}

module.exports = nextConfig