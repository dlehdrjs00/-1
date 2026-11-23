import type { EventItem } from '../types'

/**
 * 시연용 가상 행사. 모두 isSample: true, 제목에 [샘플] 접두어.
 * 실제 행사·공식 URL을 지어내지 않는다 (URL은 비워 둠).
 * TODO(샘플 담당 에이전트): 작품·유형·상태가 고르게 섞이도록 확장
 */
export function createSampleEvents(): EventItem[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'sample_001',
      isSample: true,
      title: '[샘플] 가상 콜라보 카페 A',
      works: ['starrail'],
      type: 'cafe',
      country: '일본',
      city: '도쿄',
      venue: '가상 카페 (샘플)',
      address: '도쿄도 가상구 1-2-3 (샘플 주소)',
      startDate: '2026-12-20',
      endDate: '2027-01-31',
      timezone: 'Asia/Tokyo',
      reservationRequired: 'required',
      reservationStart: '2026-12-01T18:00',
      reservationEnd: '2027-01-30T23:59',
      officialUrl: '',
      reservationUrl: '',
      lastCheckedDate: '2026-11-20',
      memo: '시연용 가상 데이터입니다.',
      createdAt: now,
      updatedAt: now,
    },
  ]
}
