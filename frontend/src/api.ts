export const API_URL=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
export type Role='OWNER'|'ADMIN'|'FLEET_MANAGER'|'DISPATCHER'|'SAFETY_OFFICER'|'FINANCIAL_ANALYST'|'DRIVER';
export type User={id:string;name:string;email:string;phone?:string|null;jobTitle?:string|null;avatarUrl?:string|null;role:Role;organizationId:string;organizationName:string;mustChangePassword?:boolean;driverId?:string|null;onboardingStatus?:string|null};
export type ApiFailureReason={code:string;message:string;field?:string;details?:Record<string,string|number>};
export class ApiError extends Error{
  constructor(message:string,readonly status:number,readonly code?:string,readonly reasons:ApiFailureReason[]=[]){super(message);this.name='ApiError'}
}
export const roleLabel:Record<Role,string>={OWNER:'Company Owner',ADMIN:'Administrator',FLEET_MANAGER:'Fleet Manager',DISPATCHER:'Dispatcher',SAFETY_OFFICER:'Safety Officer',FINANCIAL_ANALYST:'Financial Analyst',DRIVER:'Driver'};
localStorage.removeItem('transitops_token');
export function clearClientSession(){localStorage.removeItem('transitops_token');for(let index=sessionStorage.length-1;index>=0;index--){const key=sessionStorage.key(index);if(key?.startsWith('fleetpilot_copilot_'))sessionStorage.removeItem(key)}}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  let response:Response;try{response=await fetch(`${API_URL}${path}`,{...options,credentials:'include',headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}})}catch{throw new ApiError(`Cannot reach the FleetPilot API at ${API_URL}. Start the backend and try again.`,0,'NETWORK_ERROR')}
  if(!response.ok){let message=`Request failed (${response.status})`,code:string|undefined,reasons:ApiFailureReason[]=[];try{const body=await response.json();message=body.message||message;code=body.code;reasons=Array.isArray(body.reasons)?body.reasons:[]}catch{}if(response.status===401){clearClientSession();window.dispatchEvent(new CustomEvent('fleetpilot:auth-expired',{detail:{message}}))}throw new ApiError(message,response.status,code,reasons)}
  if(response.status===204)return undefined as T; return response.json();
}
