import { defineConfig } from 'vitest/config'

// 단위 테스트 전용 설정 (vite.config.ts 와 별도).
// 순수 로직 테스트라 기본 환경은 node. DOM 이 필요한 파일은 `// @vitest-environment jsdom` 주석으로 개별 지정.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // 호스트 시간대(UTC 컨테이너 등)에 우연히 맞아떨어지는 버그를 잡기 위해 UTC 가 아닌 시간대로 고정
    env: { TZ: 'America/Los_Angeles' },
  },
})
