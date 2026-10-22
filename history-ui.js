import {fetchArchive,normalizeRecords,csv} from './history-core.js';
import {HistoryChart} from './history-chart.js';
const $=id=>document.getElementById(id),fmt=t=>new Date(t*1000).toLocaleString('uk-UA');
function saveFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function cache(value){
  return new Promise((resolve,reject)=>{const req=indexedDB.open('htram-archive',1);req.onupgradeneeded=()=>req.result.createObjectStore('archives');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('archives',value?'readwrite':'readonly'),store=tx.objectStore('archives');const op=value?store.put(value,'last'):store.get('last');let result;op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};});
}
export class HistoryUI {
  constructor(onRead){
    this.records=[];this.meta={};this.generation=0;this.chart=new HistoryChart($('archiveCanvas'),r=>this.details(r),(start,end)=>this.windowChanged(start,end));
    $('fetchArchive').onclick=onRead;$('abortArchive').onclick=()=>{this.abort?.abort();$('archiveProgress').textContent='Зупиняємо після поточного запиту (до 6 секунд)…';};
    $('metric').onchange=()=>{this.chart.metric=$('metric').value;this.chart.draw();};
    $('zoomIn').onclick=()=>this.chart.zoom(0.5);$('zoomOut').onclick=()=>this.chart.zoom(2);$('panLeft').onclick=()=>this.chart.pan(-0.5);$('panRight').onclick=()=>this.chart.pan(0.5);$('allTime').onclick=()=>this.chart.setWindow(this.chart.min,this.chart.max);
    for(const hours of [1,24,168])$('range'+hours).onclick=()=>this.chart.setWindow(this.chart.max-hours*3600,this.chart.max);
    $('archivePosition').oninput=()=>{const width=this.chart.end-this.chart.start,span=this.chart.max-this.chart.min-width,start=this.chart.min+span*Number($('archivePosition').value)/1000;this.chart.setWindow(start,start+width);};
    $('applyDates').onclick=()=>{const start=new Date($('dateFrom').value).getTime()/1000,end=new Date($('dateTo').value).getTime()/1000;if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){$('archiveRange').textContent='Вкажіть коректний початок і кінець періоду';return;}if(!this.records.length||end<this.chart.min||start>this.chart.max){$('archiveRange').textContent='У цьому періоді немає записів';return;}this.chart.setWindow(start,end);};
    $('csvAll').onclick=()=>this.export(false);$('csvView').onclick=()=>this.export(true);
    $('jsonAll').onclick=()=>saveFile('htram-archive.json',JSON.stringify({version:1,meta:this.meta,records:this.records}), 'application/json');
    $('demoArchive').onclick=()=>this.demo();
    $('openArchive').onclick=()=>this.show(true);$('backMonitor').onclick=()=>this.show(false);
    window.addEventListener('hashchange',()=>this.show(location.hash==='#history',false));
    this.show(location.hash==='#history',false);this.buttons(false);
    const generation=this.generation;cache().then(saved=>{if(saved&&this.generation===generation&&!this.abort){this.records=normalizeRecords(saved.records);this.meta=saved.meta;this.refresh();$('archiveProgress').textContent='Відновлено останній архів із цього браузера';}}).catch(()=>{});
  }
  show(open,update=true){$('monitorPage').hidden=open;$('historyPage').hidden=!open;document.querySelector('.container').classList.toggle('archive-wide',open);if(update)history.replaceState(null,'',open?'#history':location.pathname+location.search);if(open)requestAnimationFrame(()=>this.chart.draw());}
  setConnected(enabled){this.enabled=enabled;$('fetchArchive').disabled=!enabled||!!this.abort;}
  buttons(active){$('abortArchive').hidden=!active;$('demoArchive').disabled=active;$('fetchArchive').disabled=active||!this.enabled;}
  refresh(){this.chart.setData(this.records);this.details(null);this.source();if(!this.records.length){$('archiveStats').textContent='Записів: 0';$('archiveRange').textContent='Архів порожній';}for(const id of ['csvAll','csvView','jsonAll'])$(id).disabled=!this.records.length;}
  source(){const m=this.meta;$('archiveSource').textContent=m.demo?'ДЕМО • синтетичні дані':`${m.name??'Датчик'} • ${m.complete?'архів дочитано до кінця':'неповний архів'}${m.savedAt?' • '+new Date(m.savedAt).toLocaleString('uk-UA'):''}`;}
  details(r){$('pointDetails').textContent=r?`${fmt(r.timestamp)} · CO₂: ${r.co2??'—'} ppm · температура: ${r.temperature??'—'} °C · вологість: ${r.humidity??'—'} %`:'Торкніться графіка або наведіть вказівник, щоб побачити точні значення. Клавіші ← → вибирають сусідні записи.';}
  windowChanged(start,end){
    $('archiveRange').textContent=`${fmt(start)} — ${fmt(end)}`;
    const span=this.chart.max-this.chart.min-(end-start);$('archivePosition').disabled=span<=0;$('archivePosition').value=span>0?Math.round((start-this.chart.min)/span*1000):0;
    const visible=this.records.filter(r=>r.timestamp>=start&&r.timestamp<=end);let count=0,min=Infinity,max=-Infinity,sum=0;for(const r of visible){if(r.co2!==null){++count;min=Math.min(min,r.co2);max=Math.max(max,r.co2);sum+=r.co2;}}
    $('archiveStats').textContent=`Усього: ${this.records.length.toLocaleString('uk-UA')} · у видимому періоді: ${visible.length.toLocaleString('uk-UA')}${count?` · CO₂ мін. ${min}, серед. ${Math.round(sum/count)}, макс. ${max} ppm`:''}`;
    const toInput=t=>{const d=new Date(t*1000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);};$('dateFrom').value=toInput(start);$('dateTo').value=toInput(end);
  }
  export(view){const rows=view?this.records.filter(r=>r.timestamp>=this.chart.start&&r.timestamp<=this.chart.end):this.records;saveFile(`htram-${this.meta.demo?'demo-':''}${view?'period':'archive'}.csv`,csv(rows),'text/csv;charset=utf-8');}
  async download(link){
    ++this.generation;this.abort=new AbortController();this.buttons(true);this.show(true);
    const incoming=[];let lastDraw=0,blocks=0,complete=false,error=null;
    const meta={name:link.device?.name??'HTRAM',deviceId:link.device?.id??'',savedAt:new Date().toISOString(),complete:false};
    $('archiveProgress').textContent='Запит першого блоку… Попередній архів залишається до отримання відповіді.';
    try{
      await fetchArchive(link,{signal:this.abort.signal,onBlock:part=>{
        incoming.push(...part.records);blocks=part.blocks;
        if(incoming.length>1500000)throw Error('Архів перевищив ліміт 1 500 000 записів');
        if(Date.now()-lastDraw>700||part.complete){this.records=normalizeRecords(incoming);this.meta=meta;this.refresh();lastDraw=Date.now();}
        $('archiveProgress').textContent=`Отримано блоків: ${blocks}; записів: ${incoming.length.toLocaleString('uk-UA')}. Загальна кількість наперед невідома.`;
      }});complete=true;
    }catch(e){error=e;}
    finally{
      if(blocks){this.records=normalizeRecords(incoming);this.meta={...meta,complete};this.refresh();try{await cache({meta:this.meta,records:this.records});}catch{$('archiveCache').textContent='Браузер не зміг зберегти архів локально. Завантажте CSV або JSON.';}}
      this.abort=null;this.buttons(false);
    }
    const result=complete?`Архів дочитано: ${this.records.length.toLocaleString('uk-UA')} записів.`:error?.name==='AbortError'?`Зчитування зупинено. Отримані дані — неповний архів (${blocks} блоків).`:`Зчитування перервано: ${error?.message??'невідома помилка'}. Отримано ${blocks} блоків; архів неповний.`;
    $('archiveProgress').textContent=result;return result;
  }
  demo(){
    ++this.generation;const start=Date.UTC(2026,9,15)/1000;
    this.records=Array.from({length:2016},(_,i)=>({timestamp:start+i*300,co2:i%301===0?null:Math.round(650+200*Math.sin(i/30)+450*Math.max(0,Math.sin(i/91))),temperature:Math.round((22+2*Math.sin(i/140))*10)/10,humidity:Math.round(47+8*Math.sin(i/70))}));
    this.meta={demo:true};this.refresh();$('archiveProgress').textContent='Демонстраційний тиждень: це вигадані значення для перевірки графіка, не дані вашого датчика.';
  }
}

