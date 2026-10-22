import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('site starts, opens archive demo, zooms, pans, selects detail and exports without sensor',async()=>{
 const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'duplicate DOM IDs');
 class Element extends EventTarget{
  constructor(id){super();this.id=id;this.value=id==='metric'?'co2':id==='pollSeconds'?'5':'C';this.disabled=false;this.hidden=false;this.textContent='';this.style={};this.options=[];this.classList={add(){},remove(){},toggle(){}};}
  getBoundingClientRect(){return {width:980,height:320,left:0,top:0};}
  getContext(){return new Proxy({},{get:()=>()=>{}});}setPointerCapture(){} click(){this.onclick?.();}add(){}
 }
 const nodes=new Map(ids.map(id=>[id,new Element(id)]));
 globalThis.document={getElementById:id=>{assert.ok(nodes.has(id),'missing DOM ID '+id);return nodes.get(id);},querySelector:()=>new Element('container'),createElement:()=>new Element('anchor')};
 globalThis.window={devicePixelRatio:1,addEventListener(){}};globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn();}};
 globalThis.requestAnimationFrame=fn=>fn();globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={replaceState(){}};
 await import('./app.js');
 assert.equal(nodes.get('fetchArchive').disabled,true);
 nodes.get('openArchive').click();assert.equal(nodes.get('monitorPage').hidden,true);assert.equal(nodes.get('historyPage').hidden,false);
 nodes.get('demoArchive').click();assert.match(nodes.get('archiveSource').textContent,/ДЕМО/);assert.match(nodes.get('archiveStats').textContent,/2.016/);
 const all=nodes.get('archiveRange').textContent;nodes.get('zoomIn').click();assert.notEqual(nodes.get('archiveRange').textContent,all);const zoom=nodes.get('archiveRange').textContent;nodes.get('panLeft').click();assert.notEqual(nodes.get('archiveRange').textContent,zoom);
 const canvas=nodes.get('archiveCanvas');canvas.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:400,pointerType:'mouse'}));assert.match(nodes.get('pointDetails').textContent,/CO₂:/);
 nodes.get('allTime').click();assert.equal(nodes.get('archiveRange').textContent,all);
 nodes.get('dateFrom').value='2026-10-10T00:00';nodes.get('dateTo').value='2026-10-09T00:00';nodes.get('applyDates').click();assert.match(nodes.get('archiveRange').textContent,/коректний/);
 nodes.get('allTime').click();nodes.get('csvAll').click();nodes.get('csvView').click();nodes.get('jsonAll').click();
 nodes.get('backMonitor').click();assert.equal(nodes.get('monitorPage').hidden,false);
});
