import { spawn } from 'node:child_process';
import jsQR from 'jsqr';
export function launchDevice(args:string[]){
 const child=spawn(process.execPath,['--import','tsx','cli/index.ts',...args],{env:process.env});let stdout='',stderr='',buffer='';const lines:string[]=[],waiters:((s:string)=>void)[]=[];
 child.stdout.on('data',chunk=>{const text=String(chunk);stdout+=text;buffer+=text;let end:number;while((end=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(waiters.length)waiters.shift()!(line);else lines.push(line);}});
 child.stderr.on('data',chunk=>stderr+=chunk);
 return {child,line:()=>lines.length?Promise.resolve(lines.shift()!):new Promise<string>(r=>waiters.push(r)),done:new Promise<{status:number|null;stdout:string;stderr:string}>(r=>child.once('close',status=>r({status,stdout,stderr})))};
}
// Decode the actual emitted half-block terminal QR, not a second generated QR.
export function decodeTerminal(text:string){
 const lines=text.split('Open the verification URL')[0].replace(/\x1b\[[0-9;]*m/g,'').split('\n').filter(line=>line.length>0);
 const width=Math.max(...lines.map(s=>s.length)),scale=8,margin=4,w=(width+margin*2)*scale,h=(lines.length*2+margin*2)*scale,data=new Uint8ClampedArray(w*h*4).fill(255);
 lines.forEach((line,y)=>Array.from(line).forEach((char,x)=>{for(let bit=0;bit<2;bit++){if(!(char==='█'||char==='▀'&&bit===0||char==='▄'&&bit===1))continue;for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y*2+bit+margin)*scale+dy)*w+(x+margin)*scale+dx)*4;data[i]=data[i+1]=data[i+2]=0;}}}));
 return jsQR(data,w,h)?.data;
}
