import {buildDataLogRequest, buildHeartbeatRequest, parseDataLogResponse} from './protocol.js';

export function normalizeRecords(records) {
  const unique=new Map();
  for(const r of records){
    if(!Number.isInteger(r.timestamp)||r.timestamp<0||r.timestamp>=0xffffffff)continue;
    const record={timestamp:r.timestamp,co2:r.co2,temperature:r.temperature,humidity:r.humidity};
    const key=[record.timestamp,record.co2,record.temperature,record.humidity].join('|');
    unique.set(key,record);
  }
  return [...unique.values()].sort((a,b)=>a.timestamp-b.timestamp);
}
export function nearestIndex(records,time){
  if(!records.length)return -1;
  let lo=0,hi=records.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(records[mid].timestamp<time)lo=mid+1;else hi=mid;}
  if(!lo)return 0;if(lo===records.length)return lo-1;
  return time-records[lo-1].timestamp<=records[lo].timestamp-time?lo-1:lo;
}
export function clampWindow(start,end,min,max){
  const full=Math.max(1,max-min),width=Math.min(full,Math.max(Math.min(60,full),end-start));
  const left=Math.max(min,Math.min(max-width,start));return [left,left+width];
}
export function csv(records){
  const rows=['timestamp_utc;date_utc;date_local;co2_ppm;temperature_c;humidity_percent'];
  for(const r of records){const d=new Date(r.timestamp*1000);rows.push([r.timestamp,d.toISOString(),d.toLocaleString('uk-UA'),r.co2??'',r.temperature??'',r.humidity??''].join(';'));}
  return '\ufeff'+rows.join('\r\n');
}

// No clock writes: reading an archive must not change timestamps on the sensor.
export async function fetchArchive(link,{signal,onBlock=()=>{},maxBlocks=10000,delayMs=180}={}){
  let address=[255,255,255,255],blocks=0,lastHeartbeat=Date.now();const visited=new Set();
  while(true){
    if(signal?.aborted)throw new DOMException('Зчитування зупинено','AbortError');
    if(!link.ready)throw Error('Датчик від’єднано');
    const key=address.join(',');if(visited.has(key))throw Error('Датчик повторив адресу архіву; зчитування зупинене');
    if(blocks>=maxBlocks)throw Error('Досягнуто ліміт блоків архіву');visited.add(key);
    if(Date.now()-lastHeartbeat>=12000){await link.send(buildHeartbeatRequest());lastHeartbeat=Date.now();}
    const frame=await link.send(buildDataLogRequest(address),0x2193,6000);
    if(signal?.aborted)throw new DOMException('Зчитування зупинено','AbortError');
    // Payload: status byte, 4-byte next address, then complete 8-byte records.
    if(!frame||frame.length<14||(frame.length-14)%8!==0)throw Error('Некоректна довжина блоку архіву');
    const parsed=parseDataLogResponse(frame);if(!parsed)throw Error('Не вдалося розібрати блок архіву');
    ++blocks;await onBlock({records:parsed.records,blocks,complete:parsed.isComplete});
    if(parsed.isComplete)return {blocks};
    address=parsed.nextAddress;
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
}
