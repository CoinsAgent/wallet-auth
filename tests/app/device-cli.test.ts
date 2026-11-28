import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storage } from '../../cli/auth';
import { deviceLogin } from '../../cli/device';
let directory:string;
const origin='https://idp.example';
const flow={device_code:'confidential-device-code',user_code:'ABCDEFGH',verification_uri:origin+'/device',verification_uri_complete:origin+'/device?user_code=ABCDEFGH',expires_in:300,interval:5};
const token=()=>({access_token:'private-access-token',refresh_token:'private-refresh-token',owner:'0x'+'1'.repeat(40),authorization_id:'00000000-0000-4000-8000-000000000000',issuer:origin+'/api/auth',expires_at:Date.now()/1000+900,permissions:{},registration:true,grant_expires_at:Date.now()+30*86400000});
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'device-cli-unit-'));vi.useFakeTimers();vi.setSystemTime(0);vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(process.stderr,'write').mockImplementation(()=>true);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();rmSync(directory,{recursive:true,force:true});});
describe('CLI device polling and protected credentials',()=>{
 it('obeys pending, cumulative slow_down and connection backoff without exposing secrets',async()=>{
  const polled:number[]=[],bodies:URLSearchParams[]=[];
  const fetch=vi.fn(async(url:string,init:RequestInit)=>{
   bodies.push(new URLSearchParams(String(init.body)));
   if(url.endsWith('/device/code'))return Response.json(flow);
   polled.push(Date.now());
   if(polled.length===1)return Response.json({error:'authorization_pending'},{status:400});
   if(polled.length===2)return Response.json({error:'slow_down'},{status:400});
   if(polled.length===3)throw new DOMException('timeout','TimeoutError');
   return Response.json(token());
  });vi.stubGlobal('fetch',fetch);
  const promise=deviceLogin(storage(directory),origin,'Remote CLI');await vi.advanceTimersByTimeAsync(40000);await expect(promise).resolves.toMatchObject({registration:true});
  expect(polled).toEqual([5000,10000,20000,40000]);expect(bodies[1].get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');expect(bodies[1].get('device_code')).toBe(flow.device_code);
  const stored=JSON.parse(readFileSync(join(directory,'default.json'),'utf8'));expect(stored.refresh_token).toBe('private-refresh-token');
  const output=JSON.stringify(vi.mocked(console.log).mock.calls)+JSON.stringify(vi.mocked(process.stderr.write).mock.calls);for(const secret of [flow.device_code,stored.access_token,stored.refresh_token])expect(output).not.toContain(secret);
 });
 it('stops on expiry at the original deadline instead of polling again',async()=>{
  const fetch=vi.fn(async(url:string)=>url.endsWith('/device/code')?Response.json({...flow,expires_in:10}):Response.json({error:'authorization_pending'},{status:400}));vi.stubGlobal('fetch',fetch);
  const result=deviceLogin(storage(directory),origin,'CLI').catch(e=>e);await vi.advanceTimersByTimeAsync(10000);expect((await result).message).toMatch(/expired/);expect(fetch).toHaveBeenCalledTimes(2);expect(()=>readFileSync(join(directory,'default.json'))).toThrow();
 });
 it.each(['access_denied','expired_token','invalid_grant','invalid_client'])('stops on terminal OAuth error %s without overwriting prior credentials',async error=>{
  const store=storage(directory);const previous={...token(),origin};store.write(previous);
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/device/code')?Response.json(flow):Response.json({error},{status:400})));
  const result=deviceLogin(store,origin,'CLI').catch(e=>e);await vi.advanceTimersByTimeAsync(5000);expect((await result).code).toBe(3);expect(store.read()).toEqual(previous);
 });
 it('rejects untrusted verification destinations and issuer/wallet substitutions',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...flow,verification_uri:'https://attacker.example/device'})));
  await expect(deviceLogin(storage(directory),origin,'CLI')).rejects.toThrow(/Untrusted/);
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/device/code')?Response.json(flow):Response.json({...token(),issuer:'https://attacker.example/api/auth'})));
  const result=deviceLogin(storage(directory),origin,'CLI').catch(e=>e);await vi.advanceTimersByTimeAsync(5000);expect((await result).message).toMatch(/identity mismatch/);expect(()=>readFileSync(join(directory,'default.json'))).toThrow();
 });
 it('uses manual URL/code and QR fallback when no complete URL is supplied',async()=>{
  const manual={...flow,verification_uri_complete:undefined};vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/device/code')?Response.json(manual):Response.json(token())));
  const promise=deviceLogin(storage(directory),origin,'CLI');await vi.advanceTimersByTimeAsync(5000);await promise;
  const event=JSON.parse(String(vi.mocked(console.log).mock.calls[0][0]));expect(event.verification_uri).toBe(flow.verification_uri);expect(event.user_code).toBe(flow.user_code);expect(event).not.toHaveProperty('verification_uri_complete');expect(vi.mocked(process.stderr.write)).toHaveBeenCalled();
 });
 it('cancellation clears timers, stops polling and preserves existing credentials',async()=>{
  const store=storage(directory);store.write({...token(),origin});const before=readFileSync(store.file,'utf8');
  const fetch=vi.fn(async()=>Response.json(flow));vi.stubGlobal('fetch',fetch);const result=deviceLogin(store,origin,'CLI').catch(e=>e);await vi.advanceTimersByTimeAsync(0);process.emit('SIGINT');expect((await result).message).toMatch(/cancelled/);expect(vi.getTimerCount()).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);expect(readFileSync(store.file,'utf8')).toBe(before);
 });
});
