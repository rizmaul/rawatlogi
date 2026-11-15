import {setTimeout as delay} from 'node:timers/promises';
/** Bounded concurrent execution. Claims stay atomic on the backend. */
export async function runJobPool({claim,process,getConcurrency,signal,pollMs=2500,onError=()=>{}}){
 const active=new Set();
 while(!signal.aborted){
  try{
   const requested=await getConcurrency();const limit=Math.max(1,Math.min(8,Math.floor(Number(requested))||3));
   while(!signal.aborted&&active.size<limit){
    const job=await claim();if(!job)break;
    let task;task=Promise.resolve().then(()=>process(job)).catch(onError).finally(()=>active.delete(task));active.add(task);
   }
  }catch(error){onError(error);}
  if(signal.aborted)break;
  await Promise.race([delay(pollMs),...active]);
 }
 await Promise.allSettled([...active]);
}
