import type { AppData, Trip } from '../types'
import { createSampleEvents } from './samples'

/** 첫 여행 예시: 2027년 1월 9~13일 도쿄, 숙소 아사쿠사바시 근처 (사용자가 수정 가능) */
export function createDefaultTrip(): Trip {
  const now = new Date().toISOString()
  return {
    id: 'trip_tokyo_2027',
    name: '도쿄 여행',
    startDate: '2027-01-09',
    endDate: '2027-01-13',
    timezone: 'Asia/Tokyo',
    city: '도쿄',
    accommodation: { name: '아사쿠사바시 근처 숙소', address: '', memo: '숙소 이름·주소를 입력하세요.' },
    items: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createInitialData(): AppData {
  const trip = createDefaultTrip()
  return {
    schemaVersion: 1,
    events: createSampleEvents(),
    favorites: [],
    trips: [trip],
    activeTripId: trip.id,
  }
}
