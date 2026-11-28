import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../backend/bootstrap/database';

// Explicit destructive local maintenance. Startup never invokes this command.
let db:Database.Database|undefined;
try{
 const args=process.argv.slice(2),values=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--database','--environment','--confirm'].includes(args[i])||!args[i+1]||values.has(args[i]))throw new Error();values.set(args[i],args[i+1]);}
 const path=values.get('--database')??'',environment=values.get('--environment');
 if(process.env.NODE_ENV==='production'||!['development','test'].includes(environment??'')||values.get('--confirm')!=='DELETE-LOCAL-DATABASE'||!isAbsolute(path))throw new Error();
 const info=lstatSync(path);
 if(!info.isFile()||info.isSymbolicLink()||realpathSync(path)!==path||info.uid!==process.getuid?.())throw new Error();
 db=new Database(path,{fileMustExist:true,timeout:1000});
 db.pragma('foreign_keys = OFF');
 const connection=db;
 connection.transaction(()=>{
  // Refuse unrelated storage. This replaces an initialized WalletGate schema,
  // including the earlier schema without device tables, never arbitrary files.
  const tables=connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*'").all() as {name:string}[];
  if(!['user','session','walletgateIdentityState','oauthClient','walletAddress'].every(name=>tables.some(t=>t.name===name)))throw new Error();
  for(const {name} of tables)connection.exec('DROP TABLE "'+name.replaceAll('"','""')+'"');
  initializeDatabase(connection);
  if((connection.pragma('foreign_key_check') as unknown[]).length)throw new Error();
 }).immediate();
 console.log(JSON.stringify({reset:true,environment,initialized:true}));
}catch{
 console.error('Reset refused or failed; no partial reset committed. Stop the local server and inspect the target first. Use --database /absolute/local/file.sqlite --environment development|test --confirm DELETE-LOCAL-DATABASE. All local data, clients and grants will be removed. Shared/deployed databases are outside this command’s authorized use.');
 process.exitCode=1;
}finally{db?.close();}
