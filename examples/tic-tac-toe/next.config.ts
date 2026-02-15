import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	transpilePackages: ['@bame/core'],
};

export default nextConfig;
