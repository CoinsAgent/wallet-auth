import { spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { createTestWalletGate } from './database-fixture';
import { ManagementBrowser,managementOrigin,type TestGate } from './management-fixture';
const grantType='urn:ietf:params:oauth:grant-type:device_code',resource='urn:walletgate:management';
let gate:TestGate,b:ManagementBrowser;
beforeEach(async()=>{gate=await createTestWalletGate({origin:managementOrigin,secret:'device-test-only-012345678901234567890123456789',databasePath:':memory:'});b=new ManagementBrowser(gate);});
afterEach(()=>{gate.close();vi.useRealTimers();vi.unstubAllEnvs();});
async function initiate(extra:Record<string,string>={}){
 return gate.handle(new Request(managementOrigin+'/api/auth/device/code',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'walletgate-cli',scope:'clients:manage clients:register offline_access',resource,walletgate_label:'Remote CLI',...extra})}));
}
async function begin(extra:Record<string,string>={}){const r=await initiate(extra);expect(r.status,await r.clone().text()).toBe(200);return r.json();}
const lookup=(code:string,browser=b)=>browser.request('/api/management/device',{action:'review',user_code:code});
const decide=(code:string,extra:Record<string,unknown>={},browser=b)=>browser.request('/api/management/device',{action:'decide',user_code:code,accept:true,offline:true,confirmed:true,registration:true,permissions:{},...extra});
const poll=(code:string,extra:Record<string,string>={})=>b.exchange({grant_type:grantType,device_code:code,resource,...extra});
async function authorized(extra:Record<string,string>={},permissions:Record<string,string[]>={}){const f=await begin(extra);expect((await lookup(f.user_code)).status).toBe(200);expect((await decide(f.user_code,{permissions})).status).toBe(200);const r=await poll(f.device_code);expect(r.status,await r.clone().text()).toBe(200);return r.json();}
describe('native OAuth Device Authorization with SIWE management policy',()=>{
 it('issues opaque native OAuth credentials and reuses management authority independently of browser logout',async()=>{
  const f=await begin();expect(f.expires_in).toBe(300);expect(f.interval).toBe(5);expect(f.user_code).toMatch(/^[A-Z2-9]{8}$/);expect(new URL(f.verification_uri).pathname).toBe('/device');
  expect((await lookup(f.user_code)).status).toBe(401);expect((await poll(f.device_code)).status).toBe(400);
  await b.login();expect((await lookup(f.user_code.toLowerCase())).status).toBe(200);expect((await decide(f.user_code)).status).toBe(200);
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+5000);
  const response=await poll(f.device_code);expect(response.status,await response.clone().text()).toBe(200);const t=await response.json();
  expect(t.access_token.split('.')).toHaveLength(1);expect(t.refresh_token).toBeTypeOf('string');expect(t.owner).toBe(b.account.address.toLowerCase());expect(t.authorization_id).toBeTypeOf('string');expect(t.id_token).toBeUndefined();
  expect((await b.api('/api/applications',t.access_token)).status).toBe(200);await b.request('/api/logout',{});
  const refreshed=await b.exchange({grant_type:'refresh_token',refresh_token:t.refresh_token,resource});expect(refreshed.status,await refreshed.clone().text()).toBe(200);
  expect((await poll(f.device_code)).status).toBe(400);
 });
});

describe('device consent, protocol boundaries and guessing limits',()=>{
 it('rejects client/resource/scope substitutions, duplicate fields and native endpoint bypasses',async()=>{
  for(const fields of ([{client_id:'other'},{resource:'https://attacker.example'},{scope:'openid offline_access'},{scope:'clients:manage'},{user_id:'someone'}] as Record<string,string>[]))expect((await initiate(fields)).status).toBe(400);
  const f=await begin();await b.login();
  for(const path of ['/api/auth/device','/api/auth/device/approve','/api/auth/device/deny','/api/auth/device/token'])expect((await b.request(path,{userCode:f.user_code,device_code:f.device_code,client_id:'walletgate-cli'})).status).toBe(404);
  expect((await b.request('/api/auth/device?user_code='+f.user_code)).status).toBe(404);
  expect((await decide(f.user_code)).status).toBe(409);
  expect((await lookup(f.user_code)).status).toBe(200);
  for(const fields of [{offline:false},{confirmed:false},{permissions:{unknown:['read']}},{permissions:{unknown:['read','read']}}])expect((await decide(f.user_code,fields)).status).toBe(400);
  expect((await poll(f.device_code,{client_id:'other'})).status).toBe(400);
  expect((await poll(f.device_code,{resource:'https://attacker.example'})).status).toBe(400);
  expect((await poll(f.device_code,{scope:'openid'})).status).toBe(400);
  expect(gate.db.prepare('SELECT count(*) AS n FROM oauthAccessToken').get()).toEqual({n:0});
 });
 it('requires SIWE provenance before lookup, rejects cross-origin and binds review to the exact session',async()=>{
  const f=await begin();await b.login();
  const session=gate.db.prepare('SELECT id FROM session WHERE userId = ?').get(b.account.address.toLowerCase()) as {id:string};
  gate.db.prepare("UPDATE session SET authMethod = 'password' WHERE id = ?").run(session.id);expect((await lookup(f.user_code)).status).toBe(401);
  gate.db.prepare("UPDATE session SET authMethod = 'siwe' WHERE id = ?").run(session.id);
  const other=new ManagementBrowser(gate);await other.login();
  expect((await lookup(f.user_code)).status).toBe(200);expect((await lookup(f.user_code,other)).status).toBe(403);
  await b.request('/api/logout',{});await b.login();expect((await decide(f.user_code)).status).toBe(409);
  expect((await lookup(f.user_code)).status).toBe(200);
  const r=await gate.handle(new Request(managementOrigin+'/api/management/device',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json',cookie:[...b.cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify({action:'review',user_code:f.user_code})}));expect(r.status).toBe(403);
 });
 it('counts five incorrect lookups across formatting and tabs and resets only at the fixed deadline',async()=>{
  await b.login();vi.useFakeTimers({toFake:['Date']});const now=Date.now();vi.setSystemTime(now);
  const f=await begin(),tab=new ManagementBrowser(gate);tab.cookies=b.cookies;
  for(let i=0;i<5;i++)expect((await lookup(i%2?'ZZZZ-ZZZZ':'invalid',i%2?tab:b)).status).toBe(400);
  expect((await lookup(f.user_code,tab)).status).toBe(429);
  vi.setSystemTime(now+299999);expect((await lookup('invalid')).status).toBe(429);
  vi.setSystemTime(now+300000);expect((await lookup('invalid')).status).toBe(400);
  expect(gate.db.prepare('SELECT attempts,startedAt FROM managementDeviceGuess').get()).toEqual({attempts:1,startedAt:now+300000});
 });
 it('denial issues no credentials, consumes approval, and is terminal when polled',async()=>{
  await b.login();const f=await begin();await lookup(f.user_code);
  expect((await decide(f.user_code,{accept:false,offline:false,confirmed:false})).status).toBe(200);
  const r=await poll(f.device_code);expect((await r.json()).error).toBe('access_denied');expect((await lookup(f.user_code)).status).toBe(400);
  expect(gate.db.prepare('SELECT count(*) AS n FROM managementGrant').get()).toEqual({n:0});
 });
 it('honors exact expiry and cumulative slow_down without issuing tokens',async()=>{
  vi.useFakeTimers({toFake:['Date']});const now=Date.now();vi.setSystemTime(now);const f=await begin();
  expect((await(await poll(f.device_code)).json()).error).toBe('authorization_pending');
  expect((await(await poll(f.device_code)).json()).error).toBe('slow_down');
  vi.setSystemTime(now+9999);expect((await(await poll(f.device_code)).json()).error).toBe('slow_down');
  expect(gate.db.prepare('SELECT pollingInterval FROM deviceCode').get()).toEqual({pollingInterval:15000});
  vi.setSystemTime(now+24999);expect((await(await poll(f.device_code)).json()).error).toBe('authorization_pending');
  vi.setSystemTime(now+300000);expect((await(await poll(f.device_code)).json()).error).toBe('expired_token');
  expect(gate.db.prepare('SELECT count(*) AS n FROM oauthAccessToken').get()).toEqual({n:0});
 });
 it('allows approval just before expiry but rejects redemption at expiry',async()=>{
  await b.login();vi.useFakeTimers({toFake:['Date']});const now=Date.now();const f=await begin();vi.setSystemTime(now+299999);expect((await lookup(f.user_code)).status).toBe(200);expect((await decide(f.user_code)).status).toBe(200);
  vi.setSystemTime(now+300000);expect((await(await poll(f.device_code)).json()).error).toBe('expired_token');
 });
 it('advertises standard device endpoint while preserving RP discovery',async()=>{
  const r=await b.request('/api/auth/.well-known/openid-configuration');const metadata=await r.json();expect(metadata.device_authorization_endpoint).toBe(managementOrigin+'/api/auth/device/code');expect(metadata.grant_types_supported).toContain(grantType);expect(metadata.code_challenge_methods_supported).toContain('S256');expect(metadata.jwks_uri).toBeTypeOf('string');
 });
});

describe('device grant isolation and inherited lifecycle',()=>{
 it('retains per-target permissions and rejects foreign targets',async()=>{
  await b.login();const created=await(await b.register()).json(),id=created.application.clientId;
  const t=await authorized({}, {[id]:['read']});expect((await(await b.api('/api/applications',t.access_token)).json()).applications.map((c:{clientId:string})=>c.clientId)).toEqual([id]);
  expect((await b.api('/api/applications/'+id,t.access_token,{name:'No',redirectUris:['https://rp.example/callback']},'PATCH')).status).toBe(404);
  const foreign=new ManagementBrowser(gate);await foreign.login();const f=await begin();await lookup(f.user_code,foreign);expect((await decide(f.user_code,{permissions:{[id]:['read']}},foreign)).status).toBe(400);
 });
 it('rotates refresh, isolates reuse and individual owner revocation from PKCE grants',async()=>{
  await b.login();const device=await authorized(),pkce=await b.authorize();const refreshed=await(await b.exchange({grant_type:'refresh_token',refresh_token:device.refresh_token,resource})).json();expect(refreshed.refresh_token).not.toBe(device.refresh_token);
  expect((await b.exchange({grant_type:'refresh_token',refresh_token:device.refresh_token,resource})).status).toBe(400);expect((await b.api('/api/applications',refreshed.access_token)).status).toBe(401);expect((await b.api('/api/applications',pkce.access_token)).status).toBe(200);
  const another=await authorized(),other=new ManagementBrowser(gate);await other.login();expect((await other.request('/api/management/authorizations/'+another.authorization_id,{})).status).toBe(404);
  expect((await b.request('/api/management/authorizations/'+another.authorization_id,{})).status).toBe(200);expect((await b.api('/api/applications',another.access_token)).status).toBe(401);expect((await b.exchange({grant_type:'refresh_token',refresh_token:another.refresh_token})).status).toBe(400);
 });
 it('replaces only the selected profile across flows after success, with failure preserving the prior grant',async()=>{
  await b.login();const old=await b.authorize(),other=await b.authorize(),f=await begin({walletgate_replace:old.authorization_id});await lookup(f.user_code);await decide(f.user_code,{accept:false});
  expect((await b.api('/api/applications',old.access_token)).status).toBe(200);
  const device=await authorized({walletgate_replace:old.authorization_id});expect((await b.api('/api/applications',old.access_token)).status).toBe(401);expect((await b.api('/api/applications',other.access_token)).status).toBe(200);
  const next=await b.authorize({},true,{walletgate_replace:device.authorization_id});expect((await b.api('/api/applications',device.access_token)).status).toBe(401);expect((await b.api('/api/applications',next.access_token)).status).toBe(200);
 });
 it('enforces access expiry, inactivity and absolute deadlines with no expansion on refresh',async()=>{
  await b.login();const t=await authorized();vi.useFakeTimers({toFake:['Date']});const now=Date.now();vi.setSystemTime(now+900000);
  expect((await b.api('/api/applications',t.access_token)).status).toBe(401);
  expect((await b.exchange({grant_type:'refresh_token',refresh_token:t.refresh_token,resource,scope:'openid'})).status).toBe(400);
  const r=await b.exchange({grant_type:'refresh_token',refresh_token:t.refresh_token,resource});expect(r.status).toBe(200);const next=await r.json();
  vi.setSystemTime(now+900000+7*86400000);expect((await b.exchange({grant_type:'refresh_token',refresh_token:next.refresh_token,resource})).status).toBe(400);
  vi.setSystemTime(now);const absolute=await authorized();
  gate.db.prepare('UPDATE managementGrant SET lastActivity = ? WHERE id = ?').run(absolute.grant_expires_at-1,absolute.authorization_id);
  vi.setSystemTime(absolute.grant_expires_at);expect((await b.exchange({grant_type:'refresh_token',refresh_token:absolute.refresh_token,resource})).status).toBe(400);
 });
 it('atomic native consumption permits only one concurrent redemption',async()=>{
  await b.login();const f=await begin();await lookup(f.user_code);await decide(f.user_code);
  const results=await Promise.all([poll(f.device_code),poll(f.device_code)]);expect(results.map(r=>r.status).sort()).toEqual([200,400]);expect(gate.db.prepare('SELECT count(*) AS n FROM oauthRefreshToken').get()).toEqual({n:1});
 });
});


describe('device lifecycle persistence',()=>{
 for(const delta of [-1,0,1])for(const boundary of ['device','access','idle','absolute'] as const)it(`${boundary} boundary ${delta}ms survives restart`,async()=>{
  const directory=mkdtempSync(join(tmpdir(),'device-restart-')),config={origin:managementOrigin,secret:'device-restart-test-only-012345678901234567890123456789',databasePath:join(directory,'test.sqlite')};
  try{
   gate.close();gate=await createTestWalletGate(config);b=new ManagementBrowser(gate);await b.login();
   const f=boundary==='device'?await begin():null;let t=boundary==='device'?null:await authorized();
   const row=t?gate.db.prepare('SELECT lastActivity,expiresAt FROM managementGrant WHERE id = ?').get(t.authorization_id) as {lastActivity:number;expiresAt:number}:undefined;
   const end=boundary==='device'?new Date((gate.db.prepare('SELECT expiresAt FROM deviceCode').get() as {expiresAt:string}).expiresAt).getTime():boundary==='access'?t.expires_at*1000:boundary==='idle'?row!.lastActivity+7*86400000:row!.expiresAt;
   vi.useFakeTimers({toFake:['Date']});
   if(boundary==='absolute')for(const days of [6,12,18,24]){vi.setSystemTime(row!.expiresAt-30*86400000+days*86400000);t=await(await b.exchange({grant_type:'refresh_token',refresh_token:t.refresh_token,resource})).json();}
   gate.close();gate=await createTestWalletGate(config);b.gate=gate;vi.setSystemTime(end+delta);
   const response=boundary==='device'?await lookup(f.user_code):boundary==='access'?await b.api('/api/applications',t.access_token):await b.exchange({grant_type:'refresh_token',refresh_token:t.refresh_token,resource});
   expect(response.status,await response.clone().text()).toBe(delta<0?200:boundary==='device'?410:boundary==='access'?401:400);
  }finally{rmSync(directory,{recursive:true,force:true});}
 });
 it('permits approved redemption after browser logout',async()=>{
  await b.login();const f=await begin();await lookup(f.user_code);await decide(f.user_code);await b.request('/api/logout',{});
  const r=await poll(f.device_code);expect(r.status).toBe(200);const t=await r.json();expect((await b.api('/api/applications',t.access_token)).status).toBe(200);
 });
});


describe('review regressions',()=>{
 it('explicitly releases only the reviewed pending claim, permitting a different wallet and rejecting stale approval',async()=>{
  await b.login();const f=await begin(),other=new ManagementBrowser(gate);await other.login();await lookup(f.user_code);
  expect((await other.request('/api/management/device',{action:'release',user_code:f.user_code})).status).toBe(403);
  expect((await b.request('/api/management/device',{action:'release',user_code:f.user_code})).status).toBe(200);
  expect((await decide(f.user_code)).status).toBe(409);
  expect((await lookup(f.user_code,other)).status).toBe(200);expect((await decide(f.user_code)).status).toBe(403);expect((await decide(f.user_code,{},other)).status).toBe(200);
  const r=await poll(f.device_code);expect(r.status).toBe(200);expect((await r.json()).owner).toBe(other.account.address.toLowerCase());
 });
 it('retains the same-wallet restriction for profile replacements',async()=>{
  await b.login();const t=await b.authorize(),f=await begin({walletgate_replace:t.authorization_id});await lookup(f.user_code);
  expect((await b.request('/api/management/device',{action:'release',user_code:f.user_code})).status).toBe(403);expect((await b.api('/api/applications',t.access_token)).status).toBe(200);
 });
 it('production permits repeated valid reviews and independent sessions while enforcing incorrect guesses',()=>{
  const result=spawnSync(process.execPath,['--import','tsx','tests/app/device-production.ts'],{env:{...process.env,NODE_ENV:'production'},encoding:'utf8',timeout:20000});
  expect(result.status,result.stderr).toBe(0);const observed=JSON.parse(result.stdout.trim().split('\n').pop()!);
  expect(observed).toEqual({enabled:true,valid:[200,200,200,200,200,200],invalid:[400,400,400,400,400],limited:429,independent:200});
 });
});

it('rolls back native redemption and profile replacement when issuance reaches the device deadline',async()=>{
 await b.login();const old=await b.authorize(),f=await begin({walletgate_replace:old.authorization_id});await lookup(f.user_code);await decide(f.user_code);
 const deadline=new Date((gate.db.prepare('SELECT expiresAt FROM deviceCode WHERE deviceCode = ?').get(f.device_code) as {expiresAt:string}).expiresAt).getTime();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(deadline-1000);
 const context=await gate.auth.$context,create=context.adapter.create.bind(context.adapter);
 const spy=vi.spyOn(context.adapter,'create').mockImplementation(async args=>{if(args.model==='oauthAccessToken')vi.setSystemTime(deadline);return create(args);});const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{const r=await poll(f.device_code);expect(r.status).toBe(500);expect((await r.json()).access_token).toBeUndefined();}finally{spy.mockRestore();log.mockRestore();}
 expect(gate.db.prepare('SELECT count(*) AS n FROM oauthRefreshToken').get()).toEqual({n:1});expect(gate.db.prepare('SELECT status FROM deviceCode WHERE deviceCode = ?').get(f.device_code)).toEqual({status:'approved'});expect((await b.api('/api/applications',old.access_token)).status).toBe(200);
});
