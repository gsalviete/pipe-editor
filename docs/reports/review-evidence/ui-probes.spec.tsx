// Copy temporarily into frontend/src/editor/review-evidence.spec.tsx to run.
// Assertions document existing defects; invert them when implementing fixes.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorkspaceStudio } from './WorkspaceStudio';
import { useAutosave } from './useAutosave';
import { Editor } from './Editor';
import type { PipelineIR } from '@modules/ir';
import type { WorkspacePlan } from './api';
const ir = () => JSON.parse(readFileSync(resolve(process.cwd(), '../test/fixtures/node-pnpm-nest-basic/expected-ir.json'), 'utf8')) as PipelineIR;
const plan = (name: string): WorkspacePlan => ({version:'0.1.0',name,workspacePath:name,existingComposeFiles:[],warnings:[],services:[{id:'app',name:'app',path:'.',enabled:true,stack:'node-generic',kind:'service',hostPort:3000,containerPort:3000,startCommand:'node index.js',ir:ir()}]});
const json = (body: unknown) => new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json'}});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();window.localStorage.clear();});
it('U01: rescanning leaves the old workspace mounted',()=>{
 const view=render(<WorkspaceStudio initialPlan={plan('first')} onBack={()=>{}}/>);
 view.rerender(<WorkspaceStudio initialPlan={plan('second')} onBack={()=>{}}/>);
 expect(screen.getByRole('heading',{name:'first'})).toBeTruthy();
 expect(screen.queryByRole('heading',{name:'second'})).toBeNull();
});
it('U02: a generation response restores artifacts invalidated by an edit',async()=>{
 let resolveFetch!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>resolveFetch=r)));
 render(<WorkspaceStudio initialPlan={plan('first')} onBack={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Generate bundle'}));
 fireEvent.change(screen.getByLabelText('app start command'),{target:{value:'node changed.js'}});
 await act(async()=>resolveFetch(json({provider:'github-actions',composeMode:'root',checks:[],artifacts:[{path:'Dockerfile',kind:'dockerfile',content:'OLD ARTIFACT'}]})));
 expect(screen.getByText('OLD ARTIFACT')).toBeTruthy();
 expect(screen.getByLabelText('app start command')).toHaveValue('node changed.js');
});
it('U03: reverting before the first save responds leaves an obsolete server save',async()=>{
 vi.useFakeTimers();let resolveFetch!:(r:Response)=>void;
 const fetchMock=vi.fn(()=>new Promise<Response>(r=>resolveFetch=r));vi.stubGlobal('fetch',fetchMock);
 const base=ir();const edited={...base,project:{...base.project,name:'edited'}};
 const options={workingIR:edited,loadedIR:base,detectedPath:'app',irValid:true,paused:false};
 const view=renderHook((props)=>useAutosave(props),{initialProps:options});
 await act(async()=>{vi.advanceTimersByTime(701);});
 expect(fetchMock).toHaveBeenCalledTimes(1);
 view.rerender({...options,workingIR:base});
 await act(async()=>{resolveFetch(json({}));await Promise.resolve();vi.advanceTimersByTime(1000);});
 expect(fetchMock).toHaveBeenCalledTimes(1); // No DELETE follows the stale PUT.
 expect(view.result.current.saveState).toBe('saved');
});
it('U04: saved IR from project A can be restored while project B is selected',async()=>{
 let resolveA!:(r:Response)=>void;
 const savedA=ir();savedA.project.name='SAVED-FROM-A';
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url==='/api/projects')return json({workspaceRoot:'/ws',projects:[]});
  if(url==='/api/state/pipelines')return json({pipelines:{}});
  if(url==='/api/detect'){const p=JSON.parse(String(init?.body)).projectPath;const v=ir();v.project.name=p;return json({ir:v,warnings:[]});}
  if(url.includes('projectPath=A'))return new Promise<Response>(r=>resolveA=r);
  if(url.includes('projectPath=B'))return json({saved:null});
  if(url==='/api/execute/availability')return json({available:true});
  if(url==='/api/execute')return json({runs:[]});
  if(url==='/api/advise')return json({score:100,grade:'A',findings:[]});
  return json({});
 }));
 render(<Editor/>);
 const open=async(name:string)=>{fireEvent.change(screen.getByLabelText('projectPath'),{target:{value:name}});fireEvent.click(screen.getByRole('button',{name:/edit one app/i}));await waitFor(()=>expect(screen.getByTestId('project-info').textContent).toContain(name));};
 await open('A');await waitFor(()=>expect(resolveA).toBeTypeOf('function'));await open('B');
 await act(async()=>resolveA(json({saved:{projectPath:'A',ir:savedA,savedAt:new Date().toISOString()}})));
 fireEvent.click(await screen.findByRole('button',{name:'Restore my edits'}));
 expect(screen.getByTestId('project-info').textContent).toContain('SAVED-FROM-A');
 expect(screen.getByLabelText('projectPath')).toHaveValue('B');
});
