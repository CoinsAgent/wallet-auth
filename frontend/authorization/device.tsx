import { useEffect,useRef,useState,type ReactNode } from 'react';
import { Button } from '../ui/button';
import './style.css';
type Permissions=Record<string,('read'|'update'|'delete')[]>;
type Details={user_code:string;address:string;label:string;expiresAt:number;registration:boolean;replacement?:string;clients:{clientId:string;name:string}[]};
export function DeviceApproval({code='',signIn}:{code?:string;signIn:(ready:()=>void)=>ReactNode}){
 const [userCode,setCode]=useState(code),[login,setLogin]=useState<boolean|null>(null),[details,setDetails]=useState<Details|null>(null),[permissions,setPermissions]=useState<Permissions>({}),[registration,setRegistration]=useState(false),[offline,setOffline]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
 const flight=useRef(false),heading=useRef<HTMLHeadingElement>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;fetch('/api/management/device/session',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(v=>{if(alive.current)setLogin(v.needsLogin);}).catch(()=>{if(alive.current)setError('Could not check sign-in. Reload to try again.');});return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(details||done)heading.current?.focus();},[details,done]);
 useEffect(()=>{if(!details)return;const timer=setTimeout(()=>{setDetails(null);setError('Device authorization expired. Start login again in the CLI.');},Math.max(0,details.expiresAt-Date.now()));return()=>clearTimeout(timer);},[details]);
 async function send(action:'review'|'decide',accept=false){
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/management/device',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({action,user_code:details?.user_code??userCode,...(action==='decide'?{accept,offline,confirmed,registration,permissions}:{})})});
   const value=await response.json();if(!alive.current)return;
   if(response.status===401){setDetails(null);setLogin(true);return;}
   if(!response.ok){if(response.status===409||response.status===410){setDetails(null);setPermissions({});setRegistration(false);setOffline(false);setConfirmed(false);}throw new Error(value.error??'Device authorization could not complete.');}
   if(action==='review'){setDetails(value);setPermissions({});setRegistration(false);setOffline(false);setConfirmed(false);}else{setDetails(null);setDone(value.message);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not reach WalletGate. Try again.');}
  finally{flight.current=false;if(alive.current)setBusy(false);}
 }
 function toggle(client:string,operation:'read'|'update'|'delete'){setPermissions(previous=>{const selected=new Set(previous[client]??[]);if(selected.has(operation))selected.delete(operation);else selected.add(operation);const next={...previous};if(selected.size)next[client]=[...selected];else delete next[client];return next;});}
 async function switchWallet(){
  if(flight.current)return;flight.current=true;setBusy(true);setError('');
  try{
   const released=await fetch('/api/management/device',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'release',user_code:details?.user_code})});
   if(!released.ok){const value=await released.json();throw new Error(value.error??'Could not release this request. Review again.');}
   const r=await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error('Could not sign out. Try again.');if(alive.current){setDetails(null);setLogin(true);setPermissions({});setOffline(false);setConfirmed(false);setRegistration(false);}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not sign out.');}
  finally{flight.current=false;if(alive.current)setBusy(false);}
 }
 return <div className="authorization-shell"><section className="auth-card authorization-card" aria-labelledby="device-title">
  <h1 id="device-title" ref={heading} tabIndex={-1}>Authorize a remote CLI</h1>
  {login===null&&!error&&<p role="status">Checking wallet sign-in…</p>}
  {login===true&&<p>Sign in with your wallet before reviewing the code. Opening this link does not authorize a CLI.</p>}
  {login===false&&!details&&!done&&<form onSubmit={e=>{e.preventDefault();void send('review');}}><p>Only continue if you started this login. Compare the code with your CLI, then review its permissions.</p><label htmlFor="device-code">User code</label><input id="device-code" className="device-code-input" value={userCode} maxLength={64} autoComplete="off" autoCapitalize="characters" spellCheck={false} required disabled={busy} onChange={e=>setCode(e.target.value)}/><Button disabled={busy} type="submit">Review code</Button></form>}
  {details&&<><p>Installation label: <strong>{details.label}</strong>. This label does not verify a device or executable.</p><dl><dt>Your verified wallet</dt><dd>{details.address}</dd><dt>User code</dt><dd className="device-confirmation-code">{details.user_code}</dd></dl>
   <Button variant="secondary" disabled={busy} onClick={()=>void switchWallet()}>Switch wallet</Button>
   <p>Confirm this is the code shown by the CLI you started. Do not approve a request sent by someone else.</p>
   <label className="management-choice"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>The code matches my CLI</label>
   {details.replacement&&<p>Successful login replaces this profile’s previous authorization. Other profiles remain unchanged.</p>}
   <fieldset disabled={busy}><legend>Registration permission</legend>{details.registration?<label className="management-choice"><input type="checkbox" checked={registration} onChange={e=>setRegistration(e.target.checked)}/>Create new applications using single-use IATs</label>:<p>Registration was not requested.</p>}</fieldset>
   <div className="management-targets">{details.clients.map(client=><fieldset disabled={busy} key={client.clientId}><legend>{client.name||client.clientId}</legend><p className="management-id">{client.clientId}</p>{(['read','update','delete'] as const).map(operation=><label className="management-choice" key={operation}><input type="checkbox" checked={permissions[client.clientId]?.includes(operation)??false} onChange={()=>toggle(client.clientId,operation)}/>{operation==='read'?'Read configuration':operation==='update'?'Update name and redirects':'Permanently delete'}</label>)}</fieldset>)}</div>
   {!details.clients.length&&<p>No owned applications yet. Registration can be approved separately above.</p>}
   <fieldset disabled={busy}><legend>Continued access</legend><p>Device login requires your explicit permission to renew access. Each access token lasts up to 15 minutes. Authorization ends after seven days without successful refresh or permitted management use, or 30 days from consent. Browser sign-out does not revoke it.</p><label className="management-choice"><input type="checkbox" checked={offline} onChange={e=>setOffline(e.target.checked)}/>Allow continued access within these limits</label></fieldset>
   <p>Declining ends this login without issuing credentials. You can revoke this authorization from <a href="/#authorizations">CLI authorizations</a>.</p>
   <div className="authorization-actions"><Button variant="secondary" disabled={busy} onClick={()=>void send('decide',false)}>Deny</Button><Button disabled={busy||!offline||!confirmed} onClick={()=>void send('decide',true)}>Allow selected access</Button></div>
  </>}
  {busy&&<p role="status">Processing device authorization…</p>}{done&&<p role="status">{done}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </section>{login===true&&signIn(()=>{setLogin(false);setDetails(null);setError('');})}</div>;
}
