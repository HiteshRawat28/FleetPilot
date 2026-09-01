import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import type { PasswordResetEmail } from '../services/email';
import { createResetToken, hashResetToken, InvalidResetTokenError, PasswordResetService, resetUrl } from './passwordReset';

type Token = { id:string; userId:string; tokenHash:string; expiresAt:Date; usedAt:Date|null };

function fakeDatabase(user:{id:string;name:string;email:string;isActive:boolean}|null) {
  const tokens:Token[]=[];
  const state={passwordHash:'old-hash',mustChangePassword:true,sessionVersion:0};
  let nextId=1;
  const passwordResetToken={
    async deleteMany({where}:any){
      const before=tokens.length;
      for(let index=tokens.length-1;index>=0;index--)if(where.tokenHash===tokens[index].tokenHash||where.expiresAt?.lt&&tokens[index].expiresAt<where.expiresAt.lt)tokens.splice(index,1);
      return{count:before-tokens.length};
    },
    async create({data}:any){const token={id:`token-${nextId++}`,usedAt:null,...data};tokens.push(token);return{id:token.id}},
    async findUnique({where}:any){const token=tokens.find(item=>item.tokenHash===where.tokenHash);return token?{...token,user:{isActive:user?.isActive??false}}:null},
    async updateMany({where,data}:any){
      let count=0;
      for(const token of tokens){
        if(where.id&&token.id!==where.id)continue;
        if(where.userId&&token.userId!==where.userId)continue;
        if(where.usedAt===null&&token.usedAt!==null)continue;
        if(where.expiresAt?.gt&&token.expiresAt<=where.expiresAt.gt)continue;
        Object.assign(token,data);count++;
      }
      return{count};
    },
  };
  const db:any={
    passwordResetToken,
    user:{
      async findUnique(){return user},
      async updateMany({where,data}:any){if(!user||where.id!==user.id||where.isActive&&!user.isActive)return{count:0};state.passwordHash=data.passwordHash;state.mustChangePassword=data.mustChangePassword;state.sessionVersion+=data.sessionVersion.increment;return{count:1}},
    },
  };
  db.$transaction=async(callback:any)=>callback(db);
  return{db:db as PrismaClient,tokens,state};
}

describe('password reset security',()=>{
  it('creates high-entropy tokens, stores a stable hash, and puts the raw token in a URL fragment',()=>{
    const first=createResetToken(new Date('2026-09-01T00:00:00Z'));const second=createResetToken(new Date('2026-09-01T00:00:00Z'));
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashResetToken(first.token));
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const url=new URL(resetUrl('https://fleetpilot.example/reset-password',first.token));
    expect(url.search).toBe('');expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(first.token);
  });

  it('issues only a hashed token for an active user and sends the raw value only through the mailer',async()=>{
    const {db,tokens}=fakeDatabase({id:'user-1',name:'Owner',email:'OWNER@example.com',isActive:true});
    const sentMessages:PasswordResetEmail[]=[];const mailer=vi.fn(async(input:PasswordResetEmail)=>{sentMessages.push(input)});const service=new PasswordResetService(db,'https://fleetpilot.example/reset-password',mailer);
    expect(await service.request(' owner@example.com ')).toBe('user-1');
    expect(tokens).toHaveLength(1);expect(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const sentUrl=new URL(sentMessages[0]!.resetUrl);const rawToken=new URLSearchParams(sentUrl.hash.slice(1)).get('token')!;
    expect(tokens[0].tokenHash).toBe(hashResetToken(rawToken));expect(tokens[0].tokenHash).not.toContain(rawToken);
  });

  it('does not create a token or send mail for an unknown account',async()=>{
    const {db,tokens}=fakeDatabase(null);const mailer=vi.fn(async()=>undefined);
    expect(await new PasswordResetService(db,'https://fleetpilot.example/reset-password',mailer).request('missing@example.com')).toBeNull();
    expect(tokens).toHaveLength(0);expect(mailer).not.toHaveBeenCalled();
  });

  it('invalidates an earlier unused link when a new link is requested',async()=>{
    const {db,tokens}=fakeDatabase({id:'user-1',name:'Owner',email:'owner@example.com',isActive:true});
    const service=new PasswordResetService(db,'https://fleetpilot.example/reset-password',async()=>undefined);
    await service.request('owner@example.com');await service.request('owner@example.com');
    expect(tokens).toHaveLength(2);expect(tokens[0].usedAt).toBeInstanceOf(Date);expect(tokens[1].usedAt).toBeNull();
  });

  it('sets a password, consumes all links, and increments the session version',async()=>{
    const {db,tokens,state}=fakeDatabase({id:'user-1',name:'Owner',email:'owner@example.com',isActive:true});
    const service=new PasswordResetService(db,'https://fleetpilot.example/reset-password',async()=>undefined);
    await service.request('owner@example.com');const rawToken=createResetToken().token;
    tokens[0].tokenHash=hashResetToken(rawToken);
    await service.reset(rawToken,'NewPassword123');
    expect(await bcrypt.compare('NewPassword123',state.passwordHash)).toBe(true);
    expect(state.mustChangePassword).toBe(false);expect(state.sessionVersion).toBe(1);expect(tokens[0].usedAt).toBeInstanceOf(Date);
    await expect(service.reset(rawToken,'AnotherPassword123')).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it('rejects expired and suspended-account links',async()=>{
    const expired=fakeDatabase({id:'user-1',name:'Owner',email:'owner@example.com',isActive:true});
    expired.tokens.push({id:'old',userId:'user-1',tokenHash:hashResetToken('expired-token'),expiresAt:new Date(Date.now()-1),usedAt:null});
    await expect(new PasswordResetService(expired.db,'https://fleetpilot.example/reset-password').reset('expired-token','NewPassword123')).rejects.toBeInstanceOf(InvalidResetTokenError);
    const suspended=fakeDatabase({id:'user-2',name:'Owner',email:'owner2@example.com',isActive:false});
    suspended.tokens.push({id:'suspended',userId:'user-2',tokenHash:hashResetToken('suspended-token'),expiresAt:new Date(Date.now()+60_000),usedAt:null});
    await expect(new PasswordResetService(suspended.db,'https://fleetpilot.example/reset-password').reset('suspended-token','NewPassword123')).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it('allows only one of two concurrent submissions to consume a link',async()=>{
    const {db,tokens}=fakeDatabase({id:'user-1',name:'Owner',email:'owner@example.com',isActive:true});
    const service=new PasswordResetService(db,'https://fleetpilot.example/reset-password',async()=>undefined);
    const rawToken='one-concurrent-reset-token-that-is-long-enough';
    tokens.push({id:'concurrent',userId:'user-1',tokenHash:hashResetToken(rawToken),expiresAt:new Date(Date.now()+60_000),usedAt:null});
    const results=await Promise.allSettled([service.reset(rawToken,'NewPassword123'),service.reset(rawToken,'NewPassword123')]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
  });

  it('removes a newly issued token when email delivery fails',async()=>{
    const {db,tokens}=fakeDatabase({id:'user-1',name:'Owner',email:'owner@example.com',isActive:true});
    const service=new PasswordResetService(db,'https://fleetpilot.example/reset-password',async()=>{throw new Error('mail unavailable')});
    await expect(service.request('owner@example.com')).rejects.toThrow('mail unavailable');expect(tokens).toHaveLength(0);
  });
});
