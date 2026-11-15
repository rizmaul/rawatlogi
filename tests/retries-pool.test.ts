import { test } from 'node:test';
import assert from 'node:assert/strict';
import {callAI,defaultAPIConfig} from '../shared/ai';
import {runJobPool} from '../scripts/job-pool.mjs';
const config={...defaultAPIConfig,protocol:'chat-completions' as const,apiKey:'test'};
test('504 retries four times with exponential backoff then succeeds',async()=>{
 let count=0;const delays:number[]=[];
 const result=await callAI(config,'test',{}, {},(async()=> ++count<5 ? new Response('',{status:504}) : Response.json({choices:[{message:{content:'{"ok":true}'}}]})) as typeof fetch,undefined,{sleep:async ms=>{delays.push(ms);}});
 assert.equal(count,5);assert.deepEqual(delays,[2000,4000,8000,16000]);assert.deepEqual(result.result,{ok:true});
});
test('504 exhaustion stops at five attempts; other HTTP errors are not retried',async()=>{
 for(const status of [504,401,500]){let count=0;await assert.rejects(callAI(config,'test',{}, {},(async()=>{count++;return new Response('',{status});}) as typeof fetch,undefined,{sleep:async()=>{}}), status===504?/4 automatic retries/:new RegExp(String(status)));assert.equal(count,status===504?5:1);}
});
test('job pool runs three jobs concurrently and isolates failures',{timeout:3000},async()=>{
 const stop=new AbortController();let next=0,running=0,max=0,done=0;let release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);const errors:unknown[]=[];
 await runJobPool({signal:stop.signal,pollMs:1,getConcurrency:async()=>3,claim:async()=>next<6?++next:null,process:async job=>{running++;max=Math.max(max,running);if(running===3)release();await gate;await new Promise(r=>setTimeout(r,5));running--;done++;if(done===6)stop.abort();if(job===2)throw Error('isolated');},onError:error=>errors.push(error)});
 assert.equal(max,3);assert.equal(done,6);assert.equal(errors.length,1);
});
