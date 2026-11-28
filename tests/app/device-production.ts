import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { createTestWalletGate } from './database-fixture';
const origin='http://localhost:3000';
const gate=await createTestWalletGate({origin,secret:'production-device-fixture-only-012345678901234567890123456789',databasePath:':memory:'});
try{
 const browser=()=>{
  const cookies=new Map<string,string>(),account=privateKeyToAccount(generatePrivateKey());
  async function request(path:string,body?:unknown){const r=await gate.handle(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},body:body===undefined?undefined:JSON.stringify(body)}));for(const cookie of r.headers.getSetCookie()){const [k,...v]=cookie.split(';')[0].split('=');cookies.set(k,v.join('='));}return r;}
  return {request,async login(){const challenge=await(await request('/api/challenge',{address:account.address,chainId:1})).json();const r=await request('/api/verify',{message:challenge.message,signature:await account.signMessage({message:challenge.message})});if(r.status!==200)throw new Error('Fixture SIWE failed');}};
 };
 const begin=async()=>{const r=await gate.handle(new Request(origin+'/api/auth/device/code',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:'walletgate-cli',scope:'clients:manage offline_access',resource:'urn:walletgate:management'})}));if(!r.ok)throw new Error('Fixture initiation failed');return r.json();};
 const a=browser();await a.login();const f=await begin();const valid:number[]=[],invalid:number[]=[];
 for(let i=0;i<6;i++)valid.push((await a.request('/api/management/device',{action:'review',user_code:f.user_code})).status);
 for(let i=0;i<5;i++)invalid.push((await a.request('/api/management/device',{action:'review',user_code:'invalid'})).status);
 const limited=(await a.request('/api/management/device',{action:'review',user_code:f.user_code})).status;
 const b=browser();await b.login();const other=await begin();const independent=(await b.request('/api/management/device',{action:'review',user_code:other.user_code})).status;
 console.log(JSON.stringify({enabled:(await gate.auth.$context).rateLimit.enabled,valid,invalid,limited,independent}));
}finally{gate.close();}
