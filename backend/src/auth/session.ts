export const SESSION_COOKIE='fleetpilot_session';

export function cookieValue(header:string|undefined,name:string){
  if(!header)return undefined;
  for(const part of header.split(';')){const separator=part.indexOf('=');if(separator<0)continue;const key=part.slice(0,separator).trim();if(key===name)return decodeURIComponent(part.slice(separator+1).trim())}
  return undefined;
}

export function sessionToken(headers:{authorization?:string;cookie?:string}){
  const bearer=headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer||cookieValue(headers.cookie,SESSION_COOKIE);
}

export function sessionVersionMatches(claimVersion: unknown, accountVersion: number) {
  return (typeof claimVersion === 'number' ? claimVersion : 0) === accountVersion;
}

export function sessionCookieOptions(production:boolean){return{httpOnly:true,sameSite:'lax' as const,secure:production,path:'/api',maxAge:8*60*60*1000}}
