import { describe,expect,it } from 'vitest';
import { TripStatus } from '@prisma/client';
import { locationTimestampBelongsToDispatch,locationTrustProblem,trackingStatus } from './locationTracking';

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
  it('rejects mocked, inaccurate, or far-away location points',()=>{
    const route={sourceLatitude:23.2599,sourceLongitude:77.4126,destinationLatitude:23.0225,destinationLongitude:72.5714,plannedDistanceKm:580};
    expect(locationTrustProblem({latitude:23.1,longitude:75,accuracyM:25,isMocked:false},route)).toBeNull();
    expect(locationTrustProblem({latitude:23.1,longitude:75,accuracyM:25,isMocked:true},route)).toContain('Mock');
    expect(locationTrustProblem({latitude:23.1,longitude:75,accuracyM:1200,isMocked:false},route)).toContain('accuracy');
    expect(locationTrustProblem({latitude:37.785834,longitude:-122.406417,accuracyM:5,isMocked:false},route)).toContain('supported India operating area');
    expect(locationTrustProblem({latitude:28.61,longitude:77.2,accuracyM:5,isMocked:false},route)).toContain('planned trip corridor');
  });
});
