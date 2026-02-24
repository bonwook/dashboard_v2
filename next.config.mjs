// Load environment variables for build time
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

try {
  const require = createRequire(import.meta.url)
  require('dotenv').config({ path: join(__dirname, '.env') })
} catch (e) {
  // dotenv가 없거나 .env 파일이 없어도 계속 진행
  console.warn('Could not load .env file:', e.message)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
    proxyClientMaxBodySize: 500 * 1024 * 1024,
  },
  // Turbopack workspace root 설정 (lockfile 경고 해결)
  // Next.js 16에서는 experimental.turbopack이 아닌 최상위 레벨에 설정
  turbopack: {
    root: __dirname,
  },
  // 서버 외부 패키지 설정 (deprecated 패키지 경고 완화)
  // readable-stream은 여러 패키지에서 다른 버전을 요구하므로 제외
  serverExternalPackages: ['rimraf', 'unzipper', 'fstream'],
  // webpack 설정으로 패키지 버전 충돌 완화
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 서버 사이드에서 패키지 버전 충돌 해결
      config.resolve.alias = {
        ...config.resolve.alias,
        // readable-stream 버전 통일 시도 (하지만 완전한 해결은 어려울 수 있음)
      }
    }
    return config
  },
}

export default nextConfig
