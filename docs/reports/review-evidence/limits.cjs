// Bounded child processes: do not run the cyclic case in the editor/browser.
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const root=resolve(__dirname,'../../..');
const validator=resolve(root,'backend/dist/modules/ir');
const yaml=resolve(root,'backend/node_modules/js-yaml');
const alias=spawnSync(process.execPath,['-e',`const yaml=require(${JSON.stringify(yaml)});const {validate}=require(${JSON.stringify(validator)});validate(yaml.load('metadata: &x [*x, *x]'));console.log('returned');`],{timeout:1000,encoding:'utf8',maxBuffer:1024*1024});
console.log(JSON.stringify({id:'L01',timedOut:alias.error?.code==='ETIMEDOUT',signal:alias.signal,stdout:alias.stdout,stderr:alias.stderr.slice(0,1800),status:alias.status}));
const graph=spawnSync(process.execPath,['-e',`const {validate}=require(${JSON.stringify(validator)});const base={version:'0.1.0',project:{name:'x',rootPath:'.',language:'javascript',runtime:{name:'node',version:'20'},packageManager:{name:'npm',version:'10'}},metadata:{}};for(const n of [1000,3000,5000]){const stages=Array.from({length:n},(_,i)=>({id:'s-'+i,name:'s',enabled:true,dependsOn:i?['s-'+(i-1)]:[],container:{image:'node:20'},steps:[]})).reverse();const ir={...base,stages};try{console.log(JSON.stringify({n,bytes:Buffer.byteLength(JSON.stringify(ir)),errors:validate(ir).length}));}catch(e){console.log(JSON.stringify({n,bytes:Buffer.byteLength(JSON.stringify(ir)),error:e.message}));}}`],{timeout:3000,encoding:'utf8',maxBuffer:1024*1024});
console.log(JSON.stringify({id:'L02',stdout:graph.stdout,error:graph.error?.message}));

const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pipe-review-fifo-'));
try {
 const fifo=path.join(tmp,'package.json');const made=spawnSync('mkfifo',[fifo]);
 if(made.status!==0) console.log(JSON.stringify({id:'L03',skipped:'mkfifo unavailable'}));
 else { const read=spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(root,'backend/dist/modules/editor-api/project-scan'))}).scanProjects(${JSON.stringify(tmp)})`],{timeout:1000,encoding:'utf8'});console.log(JSON.stringify({id:'L03',fifoScanTimedOut:read.error?.code==='ETIMEDOUT',signal:read.signal})); }
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
