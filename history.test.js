import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFrame} from './protocol.js';
import {fetchArchive,normalizeRecords,nearestIndex,clampWindow,csv} from './history-core.js';
const frame=(address,records=[])=>buildFrame([0x21,0x93],[1,...address,...records.flatMap(r=>[(r.timestamp>>>24)&255,(r.timestamp>>>16)&255,(r.timestamp>>>8)&255,r.timestamp&255,r.co2>>>8,r.co2&255,r.temperature&255,r.humidity])]);
const end=[255,255,255,255],sample={timestamp:1792022400,co2:1200,temperature:-5,humidity:50};
test('archive follows next-address chain and parses actual fields',async()=>{const sent=[],blocks=[];const link={ready:true,send:async packet=>{sent.push([...packet.slice(7,11)]);return sent.length===1?frame([0,0,1,0],[sample]):frame(end,[{...sample,timestamp:sample.timestamp+300}]);}};const result=await fetchArchive(link,{delayMs:0,onBlock:b=>blocks.push(b)});assert.equal(result.blocks,2);assert.deepEqual(sent,[end,[0,0,1,0]]);assert.equal(blocks[0].records[0].temperature,-5);assert.equal(blocks[1].complete,true);});
test('empty archive has a valid terminal block',async()=>{let received;await fetchArchive({ready:true,send:async()=>frame(end)},{onBlock:b=>received=b});assert.equal(received.records.length,0);assert.equal(received.complete,true);});
test('repeating address stops after preserving received blocks',async()=>{let count=0;await assert.rejects(fetchArchive({ready:true,send:async()=>frame([0,0,0,1],[sample])},{delayMs:0,onBlock:()=>count++}),/повторив адресу/);assert.equal(count,2);});
test('cancellation between blocks makes no further request',async()=>{const controller=new AbortController();let calls=0;await assert.rejects(fetchArchive({ready:true,send:async()=>{++calls;return frame([0,0,0,1],[sample]);}},{delayMs:0,signal:controller.signal,onBlock:()=>controller.abort()}),{name:'AbortError'});assert.equal(calls,1);});
test('cancellation while waiting ignores the late block',async()=>{const controller=new AbortController();let blocks=0;await assert.rejects(fetchArchive({ready:true,send:async()=>{controller.abort();return frame(end,[sample]);}},{signal:controller.signal,onBlock:()=>blocks++}),{name:'AbortError'});assert.equal(blocks,0);});
test('malformed record length is rejected, not silently truncated',async()=>{const malformed=buildFrame([0x21,0x93],[1,...end,3]);await assert.rejects(fetchArchive({ready:true,send:async()=>malformed}),/довжина/);});
test('disconnect, timeout and block limit surface to the caller',async()=>{await assert.rejects(fetchArchive({ready:false}),/від’єднано/);await assert.rejects(fetchArchive({ready:true,send:async()=>{throw Error('timeout');}}),/timeout/);await assert.rejects(fetchArchive({ready:true,send:async()=>frame([0,0,0,1])},{delayMs:0,maxBlocks:1}),/ліміт/);});
test('normalization sorts and deduplicates without losing different readings at same time',()=>{const records=normalizeRecords([{...sample,timestamp:sample.timestamp+10},sample,sample,{...sample,co2:999},{...sample,timestamp:0xffffffff}]);assert.equal(records.length,3);assert.equal(records[0].timestamp,sample.timestamp);});
test('nearest point and window clipping handle edges and tiny archives',()=>{const records=[{timestamp:100},{timestamp:200},{timestamp:900}];assert.equal(nearestIndex(records,190),1);assert.equal(nearestIndex(records,999),2);assert.equal(nearestIndex([],1),-1);assert.deepEqual(clampWindow(-100,100,0,1000),[0,200]);assert.deepEqual(clampWindow(900,1200,0,1000),[700,1000]);assert.deepEqual(clampWindow(1,1,1,2),[1,2]);});
test('CSV retains precise UTC, null values and Ukrainian Excel BOM',()=>{const text=csv([{...sample,co2:null}]);assert.ok(text.startsWith('\ufeff'));assert.ok(text.includes(new Date(sample.timestamp*1000).toISOString()));assert.ok(text.includes(';;-5;50'));});

test('archive notification length uses both header bytes',async()=>{
 const {FrameAccumulator,crc16}=await import('./protocol.js');
 const payload=new Uint8Array(301);payload[0]=1;payload.set([255,255,255,255],1);
 const prefix=new Uint8Array(6+payload.length),length=payload.length+5;
 prefix.set([0x7b,0x41,length>>>8,length&255,0x21,0x93]);prefix.set(payload,6);
 const checksum=crc16(prefix),packet=new Uint8Array(prefix.length+3);packet.set(prefix);packet.set([checksum>>>8,checksum&255,0x7d],prefix.length);
 const accumulator=new FrameAccumulator();assert.equal(accumulator.feed(packet.slice(0,100)).length,0);const frames=accumulator.feed(packet.slice(100));assert.equal(frames.length,1);assert.equal(frames[0].length,packet.length);
});
