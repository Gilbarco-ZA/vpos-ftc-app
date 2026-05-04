/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		unoptimized: true
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
