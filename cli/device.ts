import QRCode from 'qrcode';
import { CliError,storage,validateOrigin,type Credential } from './auth';
const resource='urn:walletgate:management';
const grant='urn:ietf:params:oauth:grant-type:device_code';
function trustedVerification(value:unknown,origin:string){
  if(typeof value!=='string')throw new CliError('Invalid verification URL. Start login again.',3);
  const url=new URL(value);if(url.origin!==origin||url.username||url.password||url.hash)throw new CliError('Untrusted verification URL.',3);
  return url.toString();
}
export async function deviceLogin(store:ReturnType<typeof storage>,origin:string,label:string){
  validateOrigin(origin);if(!label.trim()||label.length>80)throw new CliError('Use a label of 1–80 characters.',2);
  const previous=store.read();if(previous&&previous.origin!==origin)throw new CliError('Use another profile for a different issuer.',2);
  const cancel=new AbortController();
  const interrupt=()=>cancel.abort();process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const started=Date.now();let deadline=started+300000;
  const post=(path:string,body:Record<string,string>)=>fetch(origin+'/api/auth/'+path,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'walletgate-cli',...body}),signal:AbortSignal.any([cancel.signal,AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))])});
  const pause=(ms:number)=>new Promise<void>((resolve,reject)=>{
    if(cancel.signal.aborted){reject(new CliError('Device login cancelled. No local credentials changed.',3));return;}
    const done=()=>{cancel.signal.removeEventListener('abort',abort);resolve();};
    const timer=setTimeout(done,ms);
    const abort=()=>{clearTimeout(timer);cancel.signal.removeEventListener('abort',abort);reject(new CliError('Device login cancelled. No local credentials changed.',3));};
    cancel.signal.addEventListener('abort',abort,{once:true});
  });
  try{
    const response=await post('device/code',{scope:'clients:manage clients:register offline_access',resource,walletgate_label:label,...(previous?{walletgate_replace:previous.authorization_id}:{})});
    if(!response.ok)throw new CliError('Device login could not start. Check the issuer and try again.',3);
    const flow=await response.json();
    if(typeof flow.device_code!=='string'||typeof flow.user_code!=='string'||!Number.isFinite(flow.expires_in)||flow.expires_in<=0||flow.expires_in>300||flow.interval!==undefined&&(!Number.isFinite(flow.interval)||flow.interval<=0))throw new CliError('Invalid device authorization response.',3);
    const verification=trustedVerification(flow.verification_uri,origin);
    const complete=flow.verification_uri_complete===undefined?undefined:trustedVerification(flow.verification_uri_complete,origin);
    if(complete&&new URL(complete).pathname!==new URL(verification).pathname)throw new CliError('Invalid complete verification URL.',3);
    deadline=Math.min(deadline,started+flow.expires_in*1000);
    let interval=(flow.interval??5)*1000;
    const qr=await QRCode.toString(complete??verification,{type:'terminal',small:true});
    console.log(JSON.stringify({verification_uri:verification,...(complete?{verification_uri_complete:complete}:{}),user_code:flow.user_code,expires_in:flow.expires_in,interval:interval/1000}));
    process.stderr.write(qr+'\nOpen the verification URL on your browser device, compare the user code, and approve the selected permissions and continued access. Scanning alone does not authorize.\n');
    while(Date.now()<deadline){
      await pause(Math.min(interval,Math.max(0,deadline-Date.now())));
      if(Date.now()>=deadline)break;
      let result:Response;
      try{result=await post('oauth2/token',{grant_type:grant,device_code:flow.device_code,resource});}
      catch{if(cancel.signal.aborted)throw new CliError('Device login cancelled. No local credentials changed.',3);interval*=2;console.log(JSON.stringify({status:'connection_retry',interval:interval/1000}));continue;}
      const token=await result.json();
      if(result.ok){
        if(Date.now()>=deadline||token.issuer!==origin+'/api/auth'||typeof token.access_token!=='string'||typeof token.refresh_token!=='string'||typeof token.owner!=='string'||!/^0x[0-9a-f]{40}$/.test(token.owner)||typeof token.authorization_id!=='string'||!Number.isFinite(token.expires_at)||previous&&token.owner!==previous.owner)throw new CliError('Device authorization identity mismatch. Authorize again.',3);
        store.write({...token,origin} as Credential);
        return {owner:token.owner,authorization_id:token.authorization_id,permissions:token.permissions,registration:token.registration};
      }
      if(token.error==='authorization_pending'){console.log(JSON.stringify({status:'authorization_pending'}));continue;}
      if(token.error==='slow_down'){interval+=5000;console.log(JSON.stringify({status:'slow_down',interval:interval/1000}));continue;}
      if(token.error==='access_denied')throw new CliError('Device authorization declined. No local credentials changed.',3);
      if(token.error==='expired_token')break;
      throw new CliError('Device token exchange failed. Start authorization again.',3);
    }
    throw new CliError('Device authorization expired. Start login again.',3);
  }finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
}
