/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/admin/sync',
        destination: '/admin/maintenance',
        permanent: false,
      },
      {
        source: '/admin/ewura',
        destination: '/admin/tanzania-fiscal',
        permanent: false,
      },
    ]
  },
  images: {
    unoptimized: true,
  },
	output: 'standalone',
	webpack: (config) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      "utf-8-validate": false,
      "bufferutil": false,
    };
    return config;
  },
  turbopack: {}
}

export default nextConfig
