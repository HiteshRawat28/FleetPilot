export const API_URL=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
export type Role='OWNER'|'ADMIN'|'FLEET_MANAGER'|'DISPATCHER'|'SAFETY_OFFICER'|'FINANCIAL_ANALYST'|'DRIVER';
export type User={id:string;name:string;email:string;role:Role;organizationId:string;organizationName:string;mustChangePassword?:boolean;driverId?:string;onboardingStatus?:string};
export type ApiFailureReason={code:string;message:string;field?:string;details?:Record<string,string|number>};
export class ApiError extends Error{
  constructor(message:string,readonly status:number,readonly code?:string,readonly reasons:ApiFailureReason[]=[]){super(message);this.name='ApiError'}
}
export const roleLabel:Record<Role,string>={OWNER:'Company Owner',ADMIN:'Administrator',FLEET_MANAGER:'Fleet Manager',DISPATCHER:'Dispatcher',SAFETY_OFFICER:'Safety Officer',FINANCIAL_ANALYST:'Financial Analyst',DRIVER:'Driver'};
let token=localStorage.getItem('transitops_token');
export function setToken(value:string|null){token=value;value?localStorage.setItem('transitops_token',value):localStorage.removeItem('transitops_token')}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`${API_URL}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...options.headers}});
  if(!response.ok){let message=`Request failed (${response.status})`,code:string|undefined,reasons:ApiFailureReason[]=[];try{const body=await response.json();message=body.message||message;code=body.code;reasons=Array.isArray(body.reasons)?body.reasons:[]}catch{}throw new ApiError(message,response.status,code,reasons)}
  if(response.status===204)return undefined as T; return response.json();
}
export function hasSession(){return Boolean(token)};
