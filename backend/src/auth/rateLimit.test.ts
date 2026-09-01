import { describe,expect,it,vi } from 'vitest';
import { createRateLimit, privacyHash } from './rateLimit';

describe('public auth rate limiting',()=>{
  it('hashes normalized email keys instead of retaining addresses',()=>{
    expect(privacyHash(' Owner@Example.com ')).toBe(privacyHash('owner@example.com'));
    expect(privacyHash('owner@example.com')).not.toContain('owner@example.com');
  });

  it('returns 429 after the configured request count',()=>{
    const middleware=createRateLimit({windowMs:60_000,max:2,key:()=> 'one-client'});
    const next=vi.fn();
    const response:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};
    response.status.mockReturnValue(response);
    const request:any={};
    middleware(request,response,next);middleware(request,response,next);middleware(request,response,next);
    expect(next).toHaveBeenCalledTimes(2);expect(response.status).toHaveBeenCalledWith(429);expect(response.json).toHaveBeenCalledWith({message:'Too many requests. Please try again later.'});
  });
});
