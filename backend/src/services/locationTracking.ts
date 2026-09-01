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

type Coordinates={latitude:number|null;longitude:number|null};
type RouteBounds={sourceLatitude:number|null;sourceLongitude:number|null;destinationLatitude:number|null;destinationLongitude:number|null;plannedDistanceKm:number};
type LocationPoint={latitude:number;longitude:number;accuracyM:number;isMocked?:boolean|null};

const radians=(value:number)=>value*Math.PI/180;
const earthRadiusKm=6371;

export function distanceKm(from:Coordinates,to:Coordinates):number|null{
  if(from.latitude==null||from.longitude==null||to.latitude==null||to.longitude==null)return null;
  const dLat=radians(to.latitude-from.latitude),dLon=radians(to.longitude-from.longitude);
  const a=Math.sin(dLat/2)**2+Math.cos(radians(from.latitude))*Math.cos(radians(to.latitude))*Math.sin(dLon/2)**2;
  return earthRadiusKm*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function distanceToRouteKm(point:Coordinates,route:RouteBounds):number|null{
  const start={latitude:route.sourceLatitude,longitude:route.sourceLongitude},end={latitude:route.destinationLatitude,longitude:route.destinationLongitude};
  const routeDistance=distanceKm(start,end),startDistance=distanceKm(start,point),endDistance=distanceKm(end,point);
  if(routeDistance==null||startDistance==null||endDistance==null)return null;
  if(routeDistance===0)return startDistance;
  const s=startDistance/earthRadiusKm,e=endDistance/earthRadiusKm,r=routeDistance/earthRadiusKm;
  const crossTrack=Math.asin(Math.min(1,Math.max(-1,(Math.sin(s)*Math.sin(bearing(start,point)-bearing(start,end))))))*earthRadiusKm;
  const alongTrack=Math.acos(Math.min(1,Math.max(-1,Math.cos(s)/Math.cos(crossTrack/earthRadiusKm))))*earthRadiusKm;
  if(Number.isNaN(alongTrack)||alongTrack<0)return startDistance;
  if(alongTrack>routeDistance)return endDistance;
  return Math.abs(crossTrack);
}

function bearing(from:Coordinates,to:Coordinates):number{
  const lat1=radians(from.latitude!),lat2=radians(to.latitude!),lonDelta=radians(to.longitude!-from.longitude!);
  return Math.atan2(Math.sin(lonDelta)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(lonDelta));
}

export function locationTrustProblem(point:LocationPoint,route?:RouteBounds):string|null{
  if(point.isMocked)return 'Mock locations are not accepted for live trip tracking';
  if(point.accuracyM>1000)return 'GPS accuracy is too low for live tracking';
  if(point.latitude<6||point.latitude>38||point.longitude<68||point.longitude>98)return 'Location is outside the supported India operating area';
  if(route){
    const distance=distanceToRouteKm(point,route);
    const corridorKm=Math.max(40,Math.min(150,route.plannedDistanceKm*.25));
    if(distance!=null&&distance>corridorKm)return `Location is ${Math.round(distance)} km away from the planned trip corridor`;
  }
  return null;
}
