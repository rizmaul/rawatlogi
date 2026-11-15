import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateWritingDraft} from '../scripts/writing-flow.mjs';
import {validateWritingResult} from '../shared/writing';
const url='https://s.shopee.co.id/test?variant=1';
const context={product:{name:'Test product',affiliateUrl:url},approvedEvidence:[],topic:{title:'Memilih varian'},guidance:'Hangat, tanpa klaim hasil'};
const valid=()=>({title:'Memilih varian',x:['Cek ukuran dan varian sebelum masuk keranjang.',`Tautan afiliasi: ${url}`],threads:[`Lagi membandingkan pilihan? Mulai dari ukuran dan varian dulu.\n\nTautan afiliasi: ${url}`],sourceIds:[],warnings:[]});
test('editor receives original evidence and candidate, fixes contract issues, and retains review warnings',async()=>{
 const steps:string[]=[];const progress:string[]=[];
 const output=await generateWritingDraft({context,progress:async text=>{progress.push(text);},generate:async(type,input)=>{
  steps.push(type);
  if(type==='writing')return {...valid(),x:['a'.repeat(300)],warnings:['Review exact variant.']};
  assert.deepEqual(input.approvedEvidence,[]);assert.deepEqual(input.product,context.product);assert.equal(input.guidance,context.guidance);
  assert.match(input.contractIssues.join(' '),/shorten/);assert.match(input.contractIssues.join(' '),/affiliate URL/);
  return valid();
 }});
 assert.deepEqual(steps,['writing','writingEdit']);assert.equal(progress.length,2);assert.ok(output.warnings.includes('Review exact variant.'));assert.match(output.warnings.join(' '),/Belum ada bukti/);
});
test('final draft rejects invented IDs, changed/duplicate links, missing disclosure and excessive lengths',()=>{
 assert.doesNotThrow(()=>validateWritingResult(valid(),url,[]));
 const invalid=[{...valid(),sourceIds:['invented']},{...valid(),x:[`Tautan afiliasi: ${url} ${url}`]},{...valid(),x:[`Tautan afiliasi: ${url}&changed=1`]},{...valid(),x:[url]},{...valid(),threads:['a'.repeat(501),`Tautan afiliasi: ${url}`]},{...valid(),x:['😀'.repeat(141),`Tautan afiliasi: ${url}`]}];
 for(const value of invalid)assert.throws(()=>validateWritingResult(value,url,[]),/Draft contract check failed/);
 assert.doesNotThrow(()=>validateWritingResult({...valid(),sourceIds:['approved-1']},url,['approved-1']));
});
test('editor failure cannot return an unchecked first pass',async()=>{
 await assert.rejects(generateWritingDraft({context,generate:async type=>type==='writing'?valid():({...valid(),sourceIds:['invented']})}),/supplied approved evidence/);
});
test('one bounded repair pass receives precise length defects and long-link budget',async()=>{
 let calls=0;
 const result=await generateWritingDraft({context,generate:async(type,input)=>{
  calls++;
  if(calls===1)return valid();
  if(calls===2)return {...valid(),threads:['a'.repeat(520),`Tautan afiliasi: ${url}`]};
  assert.equal(input.repairOnly,true);assert.match(input.contractIssues.join(' '),/520.*500/);
  assert.equal(input.platformBudgets.threads.affiliateLinkLength,url.length);
  return valid();
 }});
 assert.equal(calls,3);assert.deepEqual(result.x,valid().x);
});
test('impossible Threads link fails before spending generation requests',async()=>{
 let calls=0;
 await assert.rejects(generateWritingDraft({context:{...context,product:{affiliateUrl:'https://example.com/'+ 'a'.repeat(500)}},generate:async()=>{calls++;return valid();}}),/shorter official affiliate link/);
 assert.equal(calls,0);
});
