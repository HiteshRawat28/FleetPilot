import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, LockKeyhole, Route, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';

type ResetMode = 'forgot' | 'reset';

function ResetLogo() {
  return <div className="logo"><span><Route size={21}/></span><div>Fleet<span>Pilot</span><small>Intelligent fleet operations</small></div></div>;
}

function ResetLayout({children}:{children:ReactNode}) {
  return <main className="auth-page reset-auth-page"><section className="auth-story"><a className="auth-back" href="/login"><ArrowLeft/> Back to sign in</a><div><span className="eyebrow">Account recovery</span><h1>Secure reset.<br/><i>Back in control.</i></h1><p>Recover access through your verified work email. Reset links are short-lived, single-use, and invalidate existing FleetPilot sessions.</p><div className="auth-trust"><span><ShieldCheck/> Single-use reset link</span><span><LockKeyhole/> Existing sessions revoked</span></div></div><small>FLEETPILOT / INTELLIGENT FLEET OPERATIONS</small></section><section className="auth-panel"><div className="auth-card reset-card"><ResetLogo/>{children}</div></section></main>;
}

function Alert({title,message}:{title:string;message:string}) {
  return <div className="alert" role="alert"><X size={17}/><span><b>{title}</b>{message}</span></div>;
}

export function PasswordResetPage({mode}:{mode:ResetMode}) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [complete,setComplete]=useState(false);
  const [token]=useState(()=>mode==='reset'?new URLSearchParams(location.hash.slice(1)).get('token')||'':'');

  useEffect(()=>{
    if(mode==='reset'&&location.hash)history.replaceState({},'',location.pathname);
  },[mode]);

  async function requestReset(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try { await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});setComplete(true); }
    catch(error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function applyReset(event:FormEvent) {
    event.preventDefault();setError('');
    if(password!==confirmation){setError('The password confirmation does not match.');return}
    setBusy(true);
    try { await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})});setComplete(true); }
    catch(error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  if(mode==='forgot')return <ResetLayout><span className="eyebrow">Password recovery</span><h2>{complete?'Check your inbox.':'Forgot password?'}</h2>{complete?<div className="reset-success" role="status"><span><Check/></span><p>If a FleetPilot account exists for <b>{email}</b>, password-reset instructions have been sent. The link is short-lived and can only be used once.</p><a className="button primary" href="/login">Return to sign in</a></div>:<><p>Enter your work email and we’ll send a secure, single-use reset link.</p>{error&&<Alert title="Unable to request a reset" message={error}/>}<form onSubmit={requestReset}><label className="field"><span>Work email</span><input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} autoFocus required/></label><button className="button primary" type="submit" disabled={busy}>{busy?'Sending…':'Send reset link'} <ShieldCheck size={18}/></button></form><a className="reset-back-link" href="/login"><ArrowLeft/> Remembered your password?</a></>}</ResetLayout>;

  const missingToken=token.length<32;
  return <ResetLayout><span className="eyebrow">Choose a new password</span><h2>{complete?'Password updated.':'Reset password'}</h2>{complete?<div className="reset-success" role="status"><span><Check/></span><p>Your password has been changed and all previous FleetPilot sessions have been revoked.</p><a className="button primary" href="/login">Sign in with new password</a></div>:missingToken?<><Alert title="Invalid reset link" message="This reset link is incomplete. Request a new password-reset email."/><a className="button primary reset-full-button" href="/forgot-password">Request a new link</a></>:<><p>Use at least 10 characters, including one uppercase letter and one number.</p>{error&&<Alert title="Unable to reset password" message={error}/>}<form onSubmit={applyReset}><label className="field"><span>New password</span><input type="password" autoComplete="new-password" minLength={10} value={password} onChange={event=>setPassword(event.target.value)} pattern="(?=.*[A-Z])(?=.*[0-9]).{10,}" title="At least 10 characters with one uppercase letter and one number" autoFocus required/></label><label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={10} value={confirmation} onChange={event=>setConfirmation(event.target.value)} required/></label><div className="password-requirements" aria-live="polite"><span className={password.length>=10?'met':''}><Check/> 10+ characters</span><span className={/[A-Z]/.test(password)?'met':''}><Check/> Uppercase letter</span><span className={/[0-9]/.test(password)?'met':''}><Check/> Number</span></div><button className="button primary" type="submit" disabled={busy}>{busy?'Updating…':'Update password'} <LockKeyhole size={18}/></button></form></>}</ResetLayout>;
}
