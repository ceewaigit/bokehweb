/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  webpack: (config, { webpack }) => {
    // External dependencies that should not be bundled
    config.externals = [...(config.externals || []), 'electron'];
    
    // Ignore canvas module (not used)
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^canvas$/
      })
    );
    
    // Ignore Remotion server-side packages in browser build
    config.resolve.alias = {
      ...config.resolve.alias,
      '@remotion/bundler': false,
      '@remotion/renderer': false
    };
    
    return config;
  },
  transpilePackages: ['remotion', '@remotion/player']
}

module.exports = nextConfig