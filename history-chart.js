import {nearestIndex,clampWindow} from './history-core.js';
const metrics={co2:{label:'CO₂',unit:'ppm',color:'#38bdf8'},temperature:{label:'Температура',unit:'°C',color:'#fbbf24'},humidity:{label:'Вологість',unit:'%',color:'#34d399'}};
const fmt=t=>new Date(t*1000).toLocaleString('uk-UA');
export class HistoryChart {
  constructor(canvas,onSelect,onWindow){
    this.canvas=canvas;this.onSelect=onSelect;this.onWindow=onWindow;this.records=[];this.metric='co2';this.selected=-1;this.pointers=new Map();
    new ResizeObserver(()=>this.draw()).observe(canvas);
    canvas.addEventListener('wheel',e=>{if(!this.records.length)return;e.preventDefault();const rect=canvas.getBoundingClientRect();this.zoom(e.deltaY>0?1.25:0.8,Math.max(0,Math.min(1,(e.clientX-rect.left-55)/(rect.width-75))));},{passive:false});
    canvas.addEventListener('pointerdown',e=>{if(!this.records.length)return;canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.drag={x:e.clientX,y:e.clientY,start:this.start,end:this.end,moved:false};this.pinchDistance=this.distance();});
    canvas.addEventListener('pointermove',e=>{
      if(!this.records.length)return;
      if(this.pointers.has(e.pointerId)){
        this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.pointers.size===2){const dist=this.distance();if(this.pinchDistance>0&&dist>0)this.zoom(this.pinchDistance/dist);this.pinchDistance=dist;this.drag.moved=true;}
        else if(this.drag){const delta=e.clientX-this.drag.x;if(Math.abs(delta)>4||Math.abs(e.clientY-this.drag.y)>4)this.drag.moved=true;const shift=-delta/(canvas.getBoundingClientRect().width-75)*(this.drag.end-this.drag.start);this.setWindow(this.drag.start+shift,this.drag.end+shift);}
      }else if(e.pointerType==='mouse')this.pick(e.clientX);
    });
    const release=e=>{if(this.drag&&!this.drag.moved)this.pick(e.clientX);this.pointers.delete(e.pointerId);if(this.pointers.size===1){const p=[...this.pointers.values()][0];this.drag={...p,start:this.start,end:this.end,moved:true};}else this.drag=null;this.pinchDistance=0;};
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);this.drag=null;});
    canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(!this.records.length)return;this.selected=Math.max(0,Math.min(this.records.length-1,(this.selected<0?0:this.selected)+(e.key==='ArrowLeft'?-1:1)));const t=this.records[this.selected].timestamp;if(t<this.start||t>this.end){const width=this.end-this.start;this.setWindow(t-width/2,t+width/2);}this.showSelection();}if(e.key==='+'||e.key==='=')this.zoom(0.5);if(e.key==='-')this.zoom(2);});
  }
  distance(){if(this.pointers.size<2)return 0;const [a,b]=[...this.pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
  setData(records){this.records=records;this.selected=-1;this.min=records[0]?.timestamp??0;this.max=Math.max(this.min+1,records.at(-1)?.timestamp??1);this.setWindow(this.min,this.max);}
  setWindow(start,end){if(!this.records.length){this.start=0;this.end=1;this.draw();return;}[this.start,this.end]=clampWindow(start,end,this.min,this.max);this.draw();this.onWindow?.(this.start,this.end);}
  zoom(factor,anchor=0.5){if(!this.records.length)return;const width=this.end-this.start,center=this.start+width*anchor;this.setWindow(center-width*factor*anchor,center+width*factor*(1-anchor));}
  pan(fraction){const d=(this.end-this.start)*fraction;this.setWindow(this.start+d,this.end+d);}
  pick(clientX){const rect=this.canvas.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(clientX-rect.left-55)/(rect.width-75)));this.selected=nearestIndex(this.records,this.start+fraction*(this.end-this.start));this.showSelection();}
  showSelection(){this.onSelect?.(this.records[this.selected]);this.draw();}
  draw(){
    const rect=this.canvas.getBoundingClientRect();if(rect.width<1)return;
    const w=rect.width,h=320,dpr=Math.min(3,window.devicePixelRatio||1);this.canvas.width=w*dpr;this.canvas.height=h*dpr;
    const ctx=this.canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#071121';ctx.fillRect(0,0,w,h);ctx.font='12px system-ui';ctx.fillStyle='#94a3b8';
    if(!this.records.length){ctx.textAlign='center';ctx.fillText('Зчитайте архів із датчика або відкрийте демо',w/2,h/2);return;}
    const left=55,right=w-20,top=25,bottom=h-48,pw=right-left,ph=bottom-top,m=metrics[this.metric];
    const first=nearestIndex(this.records,this.start),last=nearestIndex(this.records,this.end);
    const visible=this.records.slice(Math.max(0,first-1),Math.min(this.records.length,last+2));
    let min=Infinity,max=-Infinity;for(const r of visible){const v=r[this.metric];if(v!==null&&Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}
    if(!Number.isFinite(min)){min=0;max=1;}const pad=Math.max((max-min)*0.12,this.metric==='co2'?25:1);min-=pad;max+=pad;
    const x=t=>left+(t-this.start)/(this.end-this.start)*pw,y=v=>bottom-(v-min)/(max-min)*ph;
    ctx.fillStyle=m.color;ctx.fillText(`${m.label}, ${m.unit}`,left,16);
    for(let i=0;i<5;i++){const v=min+(max-min)*i/4,py=y(v);ctx.strokeStyle='#203149';ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(right,py);ctx.stroke();ctx.fillStyle='#94a3b8';ctx.textAlign='right';ctx.fillText(v.toFixed(this.metric==='temperature'?1:0),left-7,py+4);}
    ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();ctx.strokeStyle=m.color;ctx.lineWidth=1.6;ctx.beginPath();let pen=false;
    // Reduce by horizontal pixel while preserving extrema and gaps; source records remain intact.
    let bucket=[],column=null;
    const flush=()=>{if(!bucket.length)return;let lo=0,hi=0;for(let i=1;i<bucket.length;i++){if(bucket[i][this.metric]<bucket[lo][this.metric])lo=i;if(bucket[i][this.metric]>bucket[hi][this.metric])hi=i;}const indices=[...new Set([0,lo,hi,bucket.length-1])].sort((a,b)=>a-b);for(const i of indices){const r=bucket[i];if(pen)ctx.lineTo(x(r.timestamp),y(r[this.metric]));else{ctx.moveTo(x(r.timestamp),y(r[this.metric]));pen=true;}}bucket=[];};
    for(const r of visible){const v=r[this.metric];if(v===null||!Number.isFinite(v)){flush();pen=false;column=null;continue;}const c=Math.floor(x(r.timestamp));if(column!==null&&c!==column)flush();column=c;bucket.push(r);}flush();ctx.stroke();
    if(visible.length<80){ctx.fillStyle=m.color;for(const r of visible){const v=r[this.metric];if(v!==null&&Number.isFinite(v)){ctx.beginPath();ctx.arc(x(r.timestamp),y(v),2.5,0,Math.PI*2);ctx.fill();}}}
    if(this.selected>=0){const r=this.records[this.selected],px=x(r.timestamp);ctx.strokeStyle='#e2e8f0';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,bottom);ctx.stroke();}ctx.restore();
    ctx.fillStyle='#94a3b8';ctx.textAlign='left';ctx.fillText(fmt(this.start),left,h-20);ctx.textAlign='right';ctx.fillText(fmt(this.end),right,h-4);
  }
}
