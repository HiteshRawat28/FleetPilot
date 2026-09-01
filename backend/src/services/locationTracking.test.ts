import { describe,expect,it } from 'vitest';
import { TripStatus } from '@prisma/client';
import { locationTimestampBelongsToDispatch,trackingStatus } from './locationTracking';

describe('trip live-location state',()=>{
  const now=new Date('2026-09-01T12:00:00.000Z').getTime();
  it('waits for the first GPS fix',()=>expect(trackingStatus(TripStatus.DISPATCHED,null,now)).toBe('WAITING_FOR_GPS'));
  it('marks fresh points live',()=>expect(trackingStatus(TripStatus.IN_PROGRESS,new Date(now-20_000),now)).toBe('LIVE'));
  it('marks temporarily delayed points',()=>expect(trackingStatus(TripStatus.IN_PROGRESS,new Date(now-75_000),now)).toBe('DELAYED'));
  it('marks old points offline',()=>expect(trackingStatus(TripStatus.DISPATCHED,new Date(now-121_000),now)).toBe('OFFLINE'));
  it('always ends tracking for terminal trips',()=>expect(trackingStatus(TripStatus.COMPLETED,new Date(now),now)).toBe('ENDED'));
  it('accepts only timestamps within the dispatch window and clock tolerance',()=>{
    const dispatchedAt=new Date(now-60_000);
    expect(locationTimestampBelongsToDispatch(new Date(now-45_000),dispatchedAt,now)).toBe(true);
    expect(locationTimestampBelongsToDispatch(new Date(dispatchedAt.getTime()-300_001),dispatchedAt,now)).toBe(false);
    expect(locationTimestampBelongsToDispatch(new Date(now+300_001),dispatchedAt,now)).toBe(false);
  });
});
