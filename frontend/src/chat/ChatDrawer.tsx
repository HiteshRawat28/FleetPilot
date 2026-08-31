import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowUp, Database, Eraser, LoaderCircle, MessageSquareText, ShieldCheck, Sparkles, X } from 'lucide-react';
import { api, roleLabel, type User } from '../api';

type Evidence={tool:string;title:string;summary:string;items:Array<{label:string;detail:string;status?:string}>};
type ChatMessage={id:string;role:'user'|'assistant';content:string;createdAt:string;evidence?:Evidence[];failed?:boolean};
type ChatResponse={message:string;evidence:Evidence[];asOf:string};
type ChatStatus={configured:boolean;model:string;readOnly:boolean;tools:string[]};

const promptsByPage:Record<string,string[]>={
  dashboard:['What needs my attention right now?','Give me a current fleet summary.','How is fleet utilization looking?'],
  vehicles:['Which vehicles are available?','Show vehicles currently in the workshop.','Which vehicle has the highest odometer?'],
  drivers:['Which driver licences expire in the next 30 days?','Show available drivers.','Which drivers are currently on trips?'],
  trips:['Show active trips.','Which trips are still drafts?','Summarise the five most recent trips.'],
  maintenance:['What maintenance jobs are active?','Summarise maintenance costs.','Which vehicles are in the workshop?'],
  finance:['Summarise operating spend for the last 30 days.','How much was spent on fuel recently?','Compare fuel and other expenses.'],
  analytics:['Explain current fleet performance.','What is our recorded operational cost?','How is vehicle ROI calculated here?']
};

function id(){return `${Date.now()}-${Math.random().toString(36).slice(2)}`}
function time(value:string){return new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit'}).format(new Date(value))}

export function ChatDrawer({open,onClose,user,page}:{open:boolean;onClose:()=>void;user:User;page:string}){
  const storageKey=`fleetpilot_copilot_${user.organizationId}_${user.id}`;
  const [messages,setMessages]=useState<ChatMessage[]>(()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{return[]}});
  const [value,setValue]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState<ChatStatus|null>(null),[statusError,setStatusError]=useState('');
  const endRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLTextAreaElement>(null),closeRef=useRef<HTMLButtonElement>(null);
  const starters=useMemo(()=>promptsByPage[page]||promptsByPage.dashboard,[page]);

  useEffect(()=>{api<ChatStatus>('/chat/status').then(setStatus).catch(error=>setStatusError((error as Error).message))},[]);
  useEffect(()=>{localStorage.setItem(storageKey,JSON.stringify(messages.slice(-30)))},[messages,storageKey]);
  useEffect(()=>{if(open){closeRef.current?.focus();setTimeout(()=>endRef.current?.scrollIntoView({block:'end'}),0)}},[open]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,busy]);
  useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey)},[open,onClose]);

  async function send(content:string){
    const cleaned=content.trim();if(!cleaned||busy||status?.configured===false)return;
    const userMessage:ChatMessage={id:id(),role:'user',content:cleaned,createdAt:new Date().toISOString()};const prior=messages.slice(-12);setMessages(current=>[...current,userMessage]);setValue('');setBusy(true);
    try{const response=await api<ChatResponse>('/chat',{method:'POST',body:JSON.stringify({message:cleaned,history:prior.map(message=>({role:message.role,content:message.content})),context:{page}})});setMessages(current=>[...current,{id:id(),role:'assistant',content:response.message,createdAt:response.asOf,evidence:response.evidence}])}
    catch(error){setMessages(current=>[...current,{id:id(),role:'assistant',content:(error as Error).message,createdAt:new Date().toISOString(),failed:true}])}
    finally{setBusy(false);setTimeout(()=>inputRef.current?.focus(),0)}
  }
  function submit(event:FormEvent){event.preventDefault();void send(value)}
  function clear(){setMessages([]);localStorage.removeItem(storageKey);inputRef.current?.focus()}
  if(!open)return null;
  const unavailable=status?.configured===false;
  return <div className="copilot-layer" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><aside className="copilot" role="dialog" aria-modal="true" aria-labelledby="copilot-title">
    <header className="copilot-head"><div className="copilot-mark"><Sparkles/></div><div><span>Read-only operations assistant</span><h2 id="copilot-title">FleetPilot Copilot</h2></div><div className="copilot-head-actions"><button onClick={clear} title="Clear conversation" aria-label="Clear conversation"><Eraser/></button><button ref={closeRef} onClick={onClose} title="Close Copilot" aria-label="Close Copilot"><X/></button></div></header>
    <div className="copilot-scope"><ShieldCheck/><span><b>{roleLabel[user.role]}</b> · Answers are limited to data your role can read.</span><i>READ ONLY</i></div>
    <div className="copilot-messages" aria-live="polite">
      {statusError&&<div className="copilot-config"><AlertTriangle/><div><b>Copilot status unavailable</b><p>{statusError}</p></div></div>}
      {unavailable&&<div className="copilot-config"><AlertTriangle/><div><b>Backend setup required</b><p>Add <code>GROQ_API_KEY</code> to <code>backend/.env</code>, then restart the API. The key stays on the server.</p></div></div>}
      {!messages.length&&!statusError&&!unavailable&&<div className="copilot-welcome"><span><MessageSquareText/></span><h3>Ask about this fleet.</h3><p>I can inspect current vehicles, drivers, trips, maintenance, and recorded costs. I cannot change operational data in Phase 1.</p><div className="copilot-starters">{starters.map(prompt=><button key={prompt} onClick={()=>void send(prompt)}>{prompt}</button>)}</div></div>}
      {messages.map(message=><article key={message.id} className={`copilot-message ${message.role}${message.failed?' failed':''}`}><div className="copilot-bubble">{message.failed&&<AlertTriangle/>}<p>{message.content}</p></div>{message.evidence?.map((source,index)=><section className="evidence-card" key={`${source.tool}-${index}`}><header><Database/><div><b>{source.title}</b><span>{source.summary}</span></div></header>{source.items.length>0&&<div className="evidence-items">{source.items.slice(0,5).map((item,itemIndex)=><div key={`${item.label}-${itemIndex}`}><span><b>{item.label}</b><small>{item.detail}</small></span>{item.status&&<i className={`evidence-status s-${item.status.toLowerCase()}`}>{item.status.replaceAll('_',' ')}</i>}</div>)}</div>}</section>)}<time>{time(message.createdAt)}</time></article>)}
      {busy&&<div className="copilot-thinking"><LoaderCircle/><span>Checking FleetPilot records…</span></div>}<div ref={endRef}/>
    </div>
    <form className="copilot-compose" onSubmit={submit}><textarea ref={inputRef} aria-label="Ask FleetPilot Copilot" placeholder={unavailable?'Configure the backend to start chatting':'Ask about vehicles, drivers, trips or costs…'} value={value} disabled={busy||unavailable} rows={2} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}}}/><button type="submit" disabled={!value.trim()||busy||unavailable} aria-label="Send message"><ArrowUp/></button><small>Fleet data may change after an answer. Verify critical decisions in the relevant module.</small></form>
  </aside></div>
}
