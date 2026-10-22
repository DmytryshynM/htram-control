import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as P from './protocol.js';
import {Link} from './link.js';
const hex=P.bytesToHex;
test('initialization uses BLE opcode and complete payload',()=>{assert.deepEqual([...P.buildRadioModeRequest(false).slice(4,-3)],[0x74,0x58,1,1,0]);});
test('notification fragments and coalesced frames survive with CRC validation',()=>{const a=new P.FrameAccumulator(),f=P.buildFrame([0x41,0x44],[2,3,232,22,45,4,0]);assert.deepEqual(a.feed(f.slice(0,8)),[]);const frames=a.feed(new Uint8Array([...f.slice(8),...f]));assert.equal(frames.length,2);assert.equal(hex(frames[0]),hex(f));const bad=f.slice();bad[8]^=1;assert.equal(a.feed(bad).length,0);});
test('short packets do not parse CRC bytes as settings or temperature',()=>{assert.equal(P.parseSettings(new Uint8Array(13)),null);assert.equal(P.parseRealtime(new Uint8Array(13)),null);assert.equal(P.parseTempUnit(new Uint8Array(10)),null);});
test('invalid notification header resynchronizes',()=>{const a=new P.FrameAccumulator(),f=P.buildHeartbeatRequest();assert.equal(a.feed(new Uint8Array([0x7b,0,0,0,...f])).length,1);});
test('telemetry uses explicit fields, including warm-up sentinel and signed temperature',()=>{const f=P.buildFrame([0x41,0x44],[2,0xff,0xfe,0xfb,45,3,1]);const d=P.parseRealtime(f);assert.equal(d.co2,null);assert.equal(d.temperature,-5);assert.equal(d.humidity,45);assert.equal(d.battery,75);assert.equal(d.charging,true);});
function mockLink(){const l=new Link();l.device=Object.assign(new EventTarget(),{gatt:{connected:true}});l.writer={properties:{writeWithoutResponse:true},async writeValueWithoutResponse(){}};return l;}
test('write failure does not poison the following command',async()=>{const l=mockLink();let calls=0;l.writer.writeValueWithoutResponse=async()=>{if(++calls===1)throw Error('write failed');};await assert.rejects(l.send(P.buildHeartbeatRequest()));await l.send(P.buildHeartbeatRequest());assert.equal(calls,2);l.cleanup();});
test('response waiter is installed before immediate notification',async()=>{const l=mockLink(),f=P.buildFrame([0x21,0x6e],[2,6,0,1]);l.writer.writeValueWithoutResponse=async()=>l.receive(new DataView(f.buffer));assert.equal(hex(await l.send(P.buildTempUnitGetRequest(),0x216e)),hex(f));l.cleanup();});
test('timeout removes waiter and subsequent command still succeeds',async()=>{const l=mockLink();await assert.rejects(l.send(P.buildTempUnitGetRequest(),0x216e,10),/Немає відповіді/);assert.equal(l.pending.size,0);await l.send(P.buildHeartbeatRequest());l.cleanup();});
test('disconnect rejects active and queued old-session requests',async()=>{const l=mockLink();const active=l.send(P.buildTempUnitGetRequest(),0x216e);const queued=l.send(P.buildHeartbeatRequest());const checks=[assert.rejects(active),assert.rejects(queued)];await new Promise(r=>setImmediate(r));l.cleanup();await Promise.all(checks);assert.equal(l.pending.size,0);});

