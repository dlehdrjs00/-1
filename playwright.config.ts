import { defineConfig, devices } from '@playwright/test'

/**
 * 프로젝트 구성
 * - mobile  (Pixel 7, Chromium 모바일 에뮬레이션): 공통 테스트 + *.mobile.spec.ts
 * - desktop (Chrome 1280×860):                    공통 테스트 + *.desktop.spec.ts
 * - mobile-small (iPhone SE 375×667 화면 크기, Chromium 엔진): *.mobile.spec.ts 만
 * 기기 전용 파일은 해당 프로젝트에만 배정하므로 skip 으로 집계되는 테스트가 없다.
 * 설치된 브라우저는 Chromium 뿐이라 WebKit(iOS Safari)·Firefox 엔진은 검증하지 않는다.
 */
// 여러 검사를 동시에 돌릴 때 충돌하지 않도록 포트·빌드 폴더를 바꿀 수 있다 (기본: 4173, dist)
const PORT = Number(process.env.E2E_PORT ?? 4173)
const OUT_DIR = process.env.E2E_OUT_DIR ?? 'dist'

const MOBILE_ONLY = /\.mobile\.spec\.ts$/
const DESKTOP_ONLY = /\.desktop\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: DESKTOP_ONLY },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
      testIgnore: MOBILE_ONLY,
    },
    {
      name: 'mobile-small',
      use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium', browserName: 'chromium' },
      testMatch: MOBILE_ONLY,
    },
  ],
  webServer: {
    command: `npx tsc -b && npx vite build --outDir ${OUT_DIR} --emptyOutDir && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
