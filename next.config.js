/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ソースマップを無効化（コードの逆解析を防止）
  productionBrowserSourceMaps: false,

  // セキュリティヘッダーを追加
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 他サイトのiframeへの埋め込みを禁止
          { key: "X-Frame-Options", value: "DENY" },
          // XSSフィルター有効化
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // MIMEタイプスニッフィング防止
          { key: "X-Content-Type-Options", value: "nosniff" },
          // リファラー情報の制限
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
