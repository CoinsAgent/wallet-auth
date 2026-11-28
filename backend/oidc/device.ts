import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { BetterAuthPlugin } from '@better-auth/core';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { DEVICE_CODE_GRANT_TYPE, getOAuthProviderApi, type OAuthOptions, type Scope } from '@better-auth/oauth-provider';
import { z } from 'zod';
import { CLI_CLIENT, MANAGEMENT_RESOURCE, MANAGEMENT_SCOPES, MANAGEMENT_MAX, getGrant, grantActive } from './management';
import { protocolAdapter } from './policy';

export const deviceDataTables = ['managementDeviceGuess','managementDevice','deviceCode'] as const;
export function clearDeviceAuthorization(db:Database.Database) { for(const table of deviceDataTables)if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))db.exec(`DELETE FROM "${table}"`); }
export const deviceSchema = `
CREATE TABLE deviceCode (id TEXT PRIMARY KEY, deviceCode TEXT NOT NULL UNIQUE, userCode TEXT NOT NULL UNIQUE, userId TEXT, expiresAt DATE NOT NULL, status TEXT NOT NULL, lastPolledAt DATE, pollingInterval INTEGER, clientId TEXT, scope TEXT, resources TEXT, oauthClientId TEXT);
CREATE TABLE managementDevice (id TEXT PRIMARY KEY, label TEXT NOT NULL, replacement TEXT, reviewedSession TEXT, owner TEXT, grantId TEXT);
CREATE TABLE managementDeviceGuess (sessionId TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE, startedAt INTEGER NOT NULL, attempts INTEGER NOT NULL);
${[...deviceDataTables,'managementGrant','managementIat','managementRate'].flatMap(table=>['INSERT','UPDATE','DELETE'].map(action=>`CREATE TRIGGER walletgate_fence_${table}_${action} BEFORE ${action} ON "${table}"
WHEN walletgate_generation() != (SELECT generation FROM walletgateIdentityState WHERE id = 1)
BEGIN SELECT RAISE(ABORT, 'WalletGate reset: restart this connection'); END;`)).join('\n')}
`;
type Device = { id:string; deviceCode:string; userCode:string; userId:string|null; expiresAt:string; status:string; lastPolledAt:string|null; pollingInterval:number; clientId:string; oauthClientId:string; scope:string; resources:string };
type Pending = { id:string; label:string; replacement:string|null; reviewedSession:string|null; owner:string|null; grantId:string|null };
const json = (body:unknown,status=200,extra?:HeadersInit)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',...extra}});
function invalid(error:string):never { throw new APIError('BAD_REQUEST',{error,error_description:'Device authorization cannot complete. Follow the CLI instructions or start again.'}); }
const normalize = (code:string)=>code.replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
export function assertDeviceStorage(db:Database.Database) {
  try {
    db.prepare('SELECT deviceCode,oauthClientId,resources FROM deviceCode LIMIT 0').all();
    db.prepare('SELECT grantId,reviewedSession FROM managementDevice LIMIT 0').all();
    db.prepare('SELECT sessionId,attempts FROM managementDeviceGuess LIMIT 0').all();
    const cli=db.prepare('SELECT grantTypes FROM oauthClient WHERE clientId = ?').get(CLI_CLIENT) as {grantTypes:string}|undefined;
    if(!cli || !JSON.parse(cli.grantTypes).includes(DEVICE_CODE_GRANT_TYPE))throw new Error();
  } catch { throw new Error('Incompatible device authorization storage. Select a newly initialized database. Startup has not reset or migrated data. See the explicit local development/test reset procedure.'); }
}

// Native Better Auth owns polling, atomic code consumption and OAuth issuance.
// This supported middleware supplies WalletGate grant identity and policy bounds.
export function deviceTokenPolicy(db:Database.Database, options:OAuthOptions<Scope[]>) {
  return {id:'walletgate-device-policy',hooks:{before:[{
    matcher:ctx=>ctx.path==='/oauth2/token'&&ctx.body?.grant_type===DEVICE_CODE_GRANT_TYPE,
    handler:createAuthMiddleware(async ctx=>{
      const provider=getOAuthProviderApi(ctx,options,DEVICE_CODE_GRANT_TYPE);
      const {clientId}=await provider.authenticateClient({requireCredentials:false});
      if(clientId!==CLI_CLIENT)invalid('unauthorized_client');
      if(typeof ctx.body.device_code!=='string')invalid('invalid_request');
      const row=db.prepare('SELECT * FROM deviceCode WHERE deviceCode = ?').get(ctx.body.device_code) as Device|undefined;
      if(!row || row.oauthClientId!==CLI_CLIENT || row.clientId!==CLI_CLIENT)invalid('invalid_grant');
      if(new Date(row.expiresAt).getTime()<=Date.now())invalid('expired_token');
      if(ctx.body.resource!==undefined && ctx.body.resource!==MANAGEMENT_RESOURCE)invalid('invalid_target');
      if(ctx.body.scope!==undefined)invalid('invalid_scope');
      if(row.resources!==JSON.stringify([MANAGEMENT_RESOURCE]))invalid('invalid_target');
      // Native slow_down leaves the interval unchanged. Persist the required
      // cumulative backoff while keeping native polling/consumption authoritative.
      if(row.lastPolledAt && Date.now()-new Date(row.lastPolledAt).getTime()<row.pollingInterval){
        db.prepare('UPDATE deviceCode SET pollingInterval = pollingInterval + 5000, lastPolledAt = ? WHERE id = ?').run(new Date().toISOString(),row.id);
        invalid('slow_down');
      }
      if(row.status!=='approved')return;
      const pending=db.prepare('SELECT * FROM managementDevice WHERE id = ?').get(row.id) as Pending|undefined;
      const grant=pending?.grantId?getGrant(db,pending.grantId):undefined;
      if(!pending || !grantActive(grant,false) || grant.activated || row.userId!==grant.owner || pending.owner!==grant.owner || grant.codeId!=='device:'+row.id)invalid('invalid_grant');
      // Device authorization is independent of browser session after consent.
      ctx.context.adapter=protocolAdapter(ctx.context.adapter,grant.expiresAt,grant.codeId!);
      return {context:{context:{adapter:ctx.context.adapter}}};
    }),
  }]}} satisfies BetterAuthPlugin;
}

const selection=z.object({action:z.literal('decide'),user_code:z.string().min(1).max(64),accept:z.boolean(),offline:z.boolean(),confirmed:z.boolean(),registration:z.boolean(),permissions:z.record(z.string().max(200),z.array(z.enum(['read','update','delete'])).min(1).max(3)).refine(v=>Object.keys(v).length<=20)}).strict();
const release=z.object({action:z.literal('release'),user_code:z.string().min(1).max(64)}).strict();
const review=z.object({action:z.literal('review'),user_code:z.string().min(1).max(64)}).strict();
export function createDeviceAuthorization(deps:{db:Database.Database;origin:string;native:(request:Request)=>Promise<Response>;identity:(headers:Headers)=>Promise<{id:string;address:string}|null>}) {
  const {db,origin}=deps;
  async function native(path:string,request:Request,body?:unknown){
    const headers=new Headers(request.headers);headers.set('accept','application/json');
    if(body!==undefined){headers.set('content-type','application/json');headers.set('origin',origin);}
    return deps.native(new Request(origin+'/api/auth'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}));
  }
  return async function handle(request:Request):Promise<Response|null>{
    const url=new URL(request.url);
    if(url.pathname==='/api/auth/device/code' && request.method==='POST'){
      if(url.search || !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return json({error:'invalid_request'},400);
      const params=new URLSearchParams(await request.text());
      const allowed=['client_id','scope','resource','walletgate_label','walletgate_replace'];
      if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1))return json({error:'invalid_request'},400);
      if(params.get('client_id')!==CLI_CLIENT)return json({error:'unauthorized_client'},400);
      if(params.get('resource')!==MANAGEMENT_RESOURCE)return json({error:'invalid_target'},400);
      const scopes=(params.get('scope')??'').split(' ');
      if(!scopes.includes('clients:manage')||!scopes.includes('offline_access')||scopes.some(s=>!MANAGEMENT_SCOPES.includes(s))||new Set(scopes).size!==scopes.length)return json({error:'invalid_scope'},400);
      const label=params.get('walletgate_label')??'CLI';
      if(!label.trim()||label.length>80)return json({error:'invalid_request'},400);
      const replacement=params.get('walletgate_replace');
      if(replacement&&!/^[a-f0-9-]{36}$/.test(replacement))return json({error:'invalid_request'},400);
      // Strip browser credentials from unauthenticated protocol initiation.
      const headers=new Headers({'content-type':'application/x-www-form-urlencoded'});
      const response=await deps.native(new Request(request.url,{method:'POST',headers,body:new URLSearchParams({client_id:CLI_CLIENT,scope:scopes.join(' '),resource:MANAGEMENT_RESOURCE})}));
      if(!response.ok)return response;
      const result=await response.clone().json();
      const row=db.prepare('SELECT id FROM deviceCode WHERE deviceCode = ?').get(result.device_code) as {id:string}|undefined;
      if(!row)throw new Error('DeviceInitiationMismatch');
      db.prepare('INSERT INTO managementDevice (id,label,replacement) VALUES (?,?,?)').run(row.id,label,replacement);
      return response;
    }
    // Do not expose native generic-session lookup/approve/deny/token aliases.
    // The only browser entry below verifies SIWE and records exact consent.
    if(url.pathname==='/api/management/device/session'&&request.method==='GET')return json({needsLogin:!await deps.identity(request.headers)});
    if(url.pathname!=='/api/management/device'||request.method!=='POST')return null;
    if(request.headers.get('origin')!==origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Use same-origin JSON.'},403);
    const identity=await deps.identity(request.headers);
    if(!identity)return json({needsLogin:true},401);
    const parsed=z.union([review,selection,release]).safeParse(await request.json());
    if(!parsed.success)return json({error:'Invalid device approval.'},400);
    const body=parsed.data,code=normalize(body.user_code);
    const now=Date.now();
    let guesses=db.prepare('SELECT startedAt,attempts FROM managementDeviceGuess WHERE sessionId = ?').get(identity.id) as {startedAt:number;attempts:number}|undefined;
    if(!guesses || now>=guesses.startedAt+300000){db.prepare('INSERT OR REPLACE INTO managementDeviceGuess VALUES (?,?,0)').run(identity.id,now);guesses={startedAt:now,attempts:0};}
    if(guesses.attempts>=5)return json({error:'Too many incorrect codes. Try again after the five-minute window.'},429,{'retry-after':String(Math.ceil((guesses.startedAt+300000-now)/1000))});
    const row=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)?db.prepare('SELECT * FROM deviceCode WHERE userCode = ?').get(code) as Device|undefined:undefined;
    const pending=row?db.prepare('SELECT * FROM managementDevice WHERE id = ?').get(row.id) as Pending|undefined:undefined;
    if(!row||!pending){db.prepare('UPDATE managementDeviceGuess SET attempts = attempts + 1 WHERE sessionId = ?').run(identity.id);return json({error:'Invalid or unavailable user code.'},400);}
    if(new Date(row.expiresAt).getTime()<=now||row.status!=='pending')return json({error:'Device authorization expired or already completed. Start login again.'},410);
    if(row.userId&&row.userId!==identity.address || pending.owner&&pending.owner!==identity.address)return json({error:'This request belongs to another wallet. Start login again.'},403);
    const replacement=pending.replacement?getGrant(db,pending.replacement):undefined;
    if(pending.replacement&&(!replacement||replacement.owner!==identity.address))return json({error:'Authorization wallet does not match.'},403);
    if(body.action==='release'){
      if(pending.reviewedSession!==identity.id||pending.owner!==identity.address)return json({error:'Review the request again before switching wallets.'},409);
      if(pending.replacement)return json({error:'This profile replacement requires its original wallet. Use a separate CLI profile for another wallet.'},403);
      db.prepare("UPDATE deviceCode SET userId = NULL WHERE id = ? AND status = 'pending'").run(row.id);
      db.prepare('UPDATE managementDevice SET reviewedSession = NULL, owner = NULL WHERE id = ?').run(row.id);
      return json({released:true});
    }
    if(body.action==='review'){
      const response=await native('/device?user_code='+encodeURIComponent(code),request);
      if(!response.ok)return response;
      db.prepare('UPDATE managementDevice SET reviewedSession = ?, owner = ? WHERE id = ?').run(identity.id,identity.address,row.id);
      return json({user_code:code,address:identity.address,label:pending.label,expiresAt:new Date(row.expiresAt).getTime(),registration:row.scope.split(' ').includes('clients:register'),replacement:pending.replacement,clients:db.prepare('SELECT clientId,name FROM oauthClient WHERE referenceId = ? ORDER BY createdAt,clientId').all(identity.address)});
    }
    if(pending.reviewedSession!==identity.id||pending.owner!==identity.address)return json({error:'Session changed. Review the code and permissions again.'},409);
    if(body.accept&&(!body.offline||!body.confirmed))return json({error:'Confirm the matching code and continued access before approval.'},400);
    if(body.accept)for(const [id,ops] of Object.entries(body.permissions))if(new Set(ops).size!==ops.length||!db.prepare('SELECT 1 FROM oauthClient WHERE clientId = ? AND referenceId = ?').get(id,identity.address))return json({error:'Invalid consent selection.'},400);
    if(body.accept&&body.registration&&!row.scope.split(' ').includes('clients:register'))return json({error:'Registration was not requested.'},400);
    const response=await native(body.accept?'/device/approve':'/device/deny',request,{userCode:code});
    if(!response.ok)return response;
    if(Date.now()>=new Date(row.expiresAt).getTime())throw new Error('DeviceConsentDeadline');
    if(body.accept){
      const id=randomUUID();
      db.prepare('INSERT INTO managementGrant (id,owner,label,permissions,registration,createdAt,lastActivity,expiresAt,codeId,replacement) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,identity.address,pending.label,JSON.stringify(body.permissions),Number(body.registration),now,now,Math.floor(now/1000)*1000+MANAGEMENT_MAX,'device:'+row.id,pending.replacement);
      db.prepare('UPDATE managementDevice SET grantId = ? WHERE id = ?').run(id,row.id);
      // Persist exactly the consented scopes; the native grant consumes this row.
      db.prepare('UPDATE deviceCode SET scope = ? WHERE id = ?').run('clients:manage offline_access'+(body.registration?' clients:register':''),row.id);
    }
    return json({approved:body.accept,message:body.accept?'Authorization approved. Return to the CLI.':'Authorization declined. No credentials issued.'});
  };
}
