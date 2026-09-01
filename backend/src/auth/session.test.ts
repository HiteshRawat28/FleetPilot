import { describe,expect,it } from 'vitest';
import { cookieValue,SESSION_COOKIE,sessionCookieOptions,sessionToken,sessionVersionMatches } from './session';

describe('browser session security',()=>{
  it('reads the named cookie without accepting similarly named cookies',()=>expect(cookieValue(`other=x; ${SESSION_COOKIE}=signed-token; ${SESSION_COOKIE}_old=bad`,SESSION_COOKIE)).toBe('signed-token'));
  it('keeps bearer authentication for API clients and gives it precedence',()=>expect(sessionToken({authorization:'Bearer api-token',cookie:`${SESSION_COOKIE}=cookie-token`})).toBe('api-token'));
  it('uses an HttpOnly, same-site cookie that is secure in production',()=>{
    expect(sessionCookieOptions(true)).toMatchObject({httpOnly:true,sameSite:'lax',secure:true,path:'/api'});
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
  it('accepts legacy sessions only while the account is still on version zero',()=>{
    expect(sessionVersionMatches(undefined,0)).toBe(true);
    expect(sessionVersionMatches(undefined,1)).toBe(false);
    expect(sessionVersionMatches(2,2)).toBe(true);
    expect(sessionVersionMatches(1,2)).toBe(false);
  });
});
