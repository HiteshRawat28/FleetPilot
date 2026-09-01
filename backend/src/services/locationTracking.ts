import { TripStatus } from '@prisma/client';

export type TrackingStatus='WAITING_FOR_GPS'|'LIVE'|'DELAYED'|'OFFLINE'|'ENDED';

export function trackingStatus(tripStatus:TripStatus,capturedAt?:Date|null,nowMs=Date.now()):TrackingStatus{
  if(tripStatus===TripStatus.COMPLETED||tripStatus===TripStatus.CANCELLED)return 'ENDED';
  if(!capturedAt)return 'WAITING_FOR_GPS';
  const ageSeconds=Math.max(0,(nowMs-capturedAt.getTime())/1000);
  if(ageSeconds<=30)return 'LIVE';
  if(ageSeconds<=120)return 'DELAYED';
  return 'OFFLINE';
}

export function locationTimestampBelongsToDispatch(capturedAt:Date,dispatchStartedAt:Date,nowMs=Date.now()):boolean{
  const clockToleranceMs=5*60*1000;
  return capturedAt.getTime()>=dispatchStartedAt.getTime()-clockToleranceMs&&capturedAt.getTime()<=nowMs+clockToleranceMs;
}
