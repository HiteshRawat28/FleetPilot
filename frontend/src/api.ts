export const API_URL=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
export type Role='OWNER'|'ADMIN'|'FLEET_MANAGER'|'DISPATCHER'|'SAFETY_OFFICER'|'FINANCIAL_ANALYST';
export type User={id:string;name:string;email:string;role:Role;organizationId:string;organizationName:string};
export const roleLabel:Record<Role,string>={OWNER:'Company Owner',ADMIN:'Administrator',FLEET_MANAGER:'Fleet Manager',DISPATCHER:'Dispatcher',SAFETY_OFFICER:'Safety Officer',FINANCIAL_ANALYST:'Financial Analyst'};
let token=localStorage.getItem('transitops_token');
export function setToken(value:string|null){token=value;value?localStorage.setItem('transitops_token',value):localStorage.removeItem('transitops_token')}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  const response=await fetch(`${API_URL}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...options.headers}});
  if(!response.ok){let message=`Request failed (${response.status})`;try{message=(await response.json()).message||message}catch{}throw new Error(message)}
  if(response.status===204)return undefined as T; return response.json();
}
export function hasSession(){return Boolean(token)};
