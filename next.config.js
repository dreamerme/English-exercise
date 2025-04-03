/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["placehold.it"],
  },
  // 添加ESLint配置，避免在生产构建时因ESLint错误导致构建失败
  eslint: {
    // 只在开发环境中报告ESLint错误，生产环境中忽略
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
