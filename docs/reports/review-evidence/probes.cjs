// Review evidence, not a passing regression suite. No Docker/network access.
// Run from repository root after `pnpm --dir backend build`.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '../../..');
const mod = (p) => require(path.join(root, 'backend/dist/modules', p));
const { validate, computeEffectiveChain } = mod('ir');
const { generate } = mod('dockerfile-generator');
const { generateGitlabCi, generateGithubActions } = mod('ci-export');
const { generateWorkspaceBundle } = mod('workspace-bundle');
const { Detector, ALL_RULES } = mod('detector');
const { scanProjects } = mod('editor-api/project-scan');
const { StateStore } = mod('state-store');
const { materializeWorkspace } = mod('executor/workspace');
const visibility = mod('executor/workspace-visibility');
const docker = mod('executor/docker-client');
const { execute } = mod('executor/execute');
const { importGithubActions, importGitlabCi } = mod('ci-import');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-review-evidence-'));
const clone = () => JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/node-npm-nest-basic/expected-ir.json'), 'utf8'));
const stage = (id, run = 'true') => ({id, name:id, enabled:true, dependsOn:[], container:{image:'node:20-alpine'}, steps:[{id:'step',run,workingDir:'.',env:{}}]});
const emit = (id, value) => console.log(JSON.stringify({id,...value}));
const plan = (ir) => ({version:'0.1.0',name:'demo',workspacePath:'.',existingComposeFiles:[],warnings:[],services:[{id:'app',name:'app',path:'.',enabled:true,stack:'node-generic',kind:'service',hostPort:3000,containerPort:3000,startCommand:'node dist/main.js',ir}]});
(async () => {
  const project = path.join(tmp,'project'); fs.mkdirSync(project);
  const victim = path.join(tmp,'outside-project.txt'); fs.writeFileSync(victim,'ORIGINAL');
  fs.symlinkSync(victim,path.join(project,'.pipe-editor-visibility-probe'));
  const copy = materializeWorkspace(project);
  const originalSpawn = cp.spawn;
  cp.spawn = () => { const c=new EventEmitter(); c.stdout=new EventEmitter(); c.stderr=new EventEmitter(); c.kill=()=>true; process.nextTick(()=>c.emit('close',1)); return c; };
  try { await visibility.assertWorkspaceVisible(copy.hostPath); } catch { /* deliberate probe failure */ }
  finally { cp.spawn=originalSpawn; copy.cleanup(); }
  const changed=fs.readFileSync(victim,'utf8'); assert.notEqual(changed,'ORIGINAL');
  emit('R01',{outsideFileOverwritten:true,newValueIsUuid:/^[0-9a-f-]{36}$/.test(changed)});
  const outsideManifest=path.join(tmp,'outside.json');
  fs.writeFileSync(outsideManifest,JSON.stringify({name:'outside-sentinel',engines:{node:'20'},packageManager:'npm@10'}));
  fs.symlinkSync(outsideManifest,path.join(project,'package.json'));
  emit('R02',{detectedName:new Detector({rules:ALL_RULES}).detect(project).ir.project.name,scannedName:scanProjects(project)[0].name});
  const ir=clone(); ir.project.runtime.version='20\nRUN echo INJECTED\n#';
  emit('R03',{validationErrors:validate(ir).length,injectedInstruction:generate(ir).dockerfile.includes('\nRUN echo INJECTED\n')});
  const multi=clone(); multi.stages.find(s=>s.id==='build').steps[0].run='echo first\necho second';
  emit('R04',{dockerfileLines:generate(multi).dockerfile.split('\n').filter(l=>l.includes('echo'))});
  const ordered=clone(); ordered.stages=[stage('second','echo SECOND'),stage('first','echo FIRST')]; ordered.stages[0].dependsOn=['first'];
  emit('R05',{validationErrors:validate(ordered).length,effectiveOrder:computeEffectiveChain(ordered).map(s=>s.id)});
  const originals={available:docker.dockerAvailable,run:docker.runStageInContainer,visible:visibility.assertWorkspaceVisible};
  const requests=[]; docker.dockerAvailable=async()=>true; visibility.assertWorkspaceVisible=async()=>{};
  docker.runStageInContainer=async(req)=>{requests.push(req);return {exitCode:0,stdout:'',stderr:'',aborted:false,argv:[]};};
  try {
    await execute({ir:ordered,projectPath:project}); emit('R05-execute',{commands:requests.map(r=>r.shellCommand)});
    requests.length=0;
    const scoped=clone(); scoped.stages=[stage('test','echo "$MODE"; pwd')]; scoped.stages[0].steps[0].env={MODE:'one'}; scoped.stages[0].steps[0].workingDir='one'; scoped.stages[0].steps.push({id:'other',run:'echo "$MODE"; pwd',env:{MODE:'two'},workingDir:'two'});
    await execute({ir:scoped,projectPath:project}); emit('R06',{env:requests[0].env,workingDir:requests[0].workingDir,gha:generateGithubActions(scoped).content});
    const empty=clone(); empty.stages=[]; emit('R07',{emptyStatus:(await execute({ir:empty,projectPath:project})).aggregateStatus});
  } finally {docker.dockerAvailable=originals.available;docker.runStageInContainer=originals.run;visibility.assertWorkspaceVisible=originals.visible;}
  const reserved=clone(); reserved.stages=[stage('stages')];
  emit('R08',{validationErrors:validate(reserved).length,gitlab:generateGitlabCi(reserved).content});
  const triggers=clone(); triggers.triggers=[{kind:'on-push',branches:'main'}]; emit('R09',{validationErrors:validate(triggers).length,gha:generateGithubActions(triggers).content});
  const p=plan(clone()); p.services[0].stack='vite'; p.services[0].name='app\nRUN echo NAME_INJECTION'; p.services[0].containerPort=8080;
  const bundle=generateWorkspaceBundle(p,'github-actions','root');
  emit('R10',{allChecksPassed:bundle.checks.every(c=>c.status==='passed'),nameInjected:bundle.artifacts.find(a=>a.kind==='dockerfile').content.includes('\nRUN echo NAME_INJECTION'),nginxStill80:bundle.artifacts.find(a=>a.kind==='nginx-config').content.includes('listen 80'),compose:bundle.artifacts.find(a=>a.kind==='compose').content});
  const noLock=plan(clone()); noLock.services[0].stack='vite'; noLock.services[0].ir.stages.find(s=>s.id==='install').steps[0].run='npm install';
  emit('R11',{dockerfile:generateWorkspaceBundle(noLock,'github-actions','root').artifacts.find(a=>a.kind==='dockerfile').content});
  const store=new StateStore(path.join(tmp,'state'),project); store.savePipeline('__proto__',clone());
  emit('R12',{savedKeys:Object.keys(store.listPipelines()),afterRestart:new StateStore(path.join(tmp,'state'),project).getPipeline('__proto__')});
  const bad=path.join(tmp,'null-project');fs.mkdirSync(bad);fs.writeFileSync(path.join(bad,'package.json'),'null');
  try { scanProjects(bad); emit('R13',{throws:false}); } catch(e){emit('R13',{throws:true,error:e.message});}
  emit('R14',{gitlabBeforeRuns:importGitlabCi('default:\n  before_script: [echo DEFAULT]\njob:\n  before_script: [echo JOB]\n  script: [echo RUN]\n').ir.stages[0].steps.map(s=>s.run),topLevelBeforeRuns:importGitlabCi('before_script: [echo REQUIRED]\njob:\n  script: [echo RUN]\n').ir.stages[0].steps.map(s=>s.run)});
  const imported=importGithubActions('jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n');
  emit('R15',{runtime:imported.ir.project.runtime,image:imported.ir.stages[0].container.image,warnings:imported.warnings});
  const c=clone(); c.stages=[stage('test')]; const before=generateGitlabCi(c).content; c.triggers=[{kind:'on-push',branches:['release-only']}];
  emit('R16',{gitlabIgnoresTriggers:before===generateGitlabCi(c).content});
  const {RunRegistry}=mod('editor-api/run-registry'); const registry=new RunRegistry(()=>new Promise(()=>{}),2); for(let i=0;i<8;i++)registry.start(clone(),project,'app'); emit('R17',{maxRetained:2,actualRunning:registry.list().length});
  const blockedDir=path.join(tmp,'blocked-state');fs.writeFileSync(blockedDir,'not a directory');const blocked=new StateStore(blockedDir,project);const acknowledged=blocked.savePipeline('app',clone());emit('R18',{acknowledged:!!acknowledged.savedAt,persistedAfterRestart:new StateStore(blockedDir,project).getPipeline('app')!==null});
  emit('DONE',{message:'Evidence reproduced. No application implementation changed.'});
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
