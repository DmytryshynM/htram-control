import * as P from './protocol.js';
import {Link} from './link.js';
const $=id=>document.getElementById(id), link=new Link();
let settings=null, deviceUnit=null, latest=null, heartbeat=null, polling=null, busy=false, pollBusy=false;
let pollInterval=5;
const lines=[];
function log(text){const line=`[${new Date().toLocaleTimeString('uk-UA')}] ${text}`;lines.push(line);if(lines.length>1000)lines.shift();$('log').textContent=lines.join('\n');$('log').style.whiteSpace='pre-wrap';$('log').scrollTop=$('log').scrollHeight;}
function controls(){const enabled=link.ready&&!busy;$('controls').disabled=!enabled;for(const id of ['muteOnBtn','muteOffBtn'])$(id).disabled=!enabled;$('saveScreen').disabled=!settings;$('saveThresholds').disabled=!settings;$('disconnectBtn').disabled=!link.device;}
function stopTimers(){clearInterval(heartbeat);clearInterval(polling);heartbeat=polling=null;}
function startTimers(){stopTimers();if(!link.ready)return;heartbeat=setInterval(()=>{if(!busy&&!pollBusy)link.send(P.buildHeartbeatRequest()).catch(e=>log(e.message));},15000);polling=setInterval(()=>poll(),pollInterval*1000);}
async function poll(){if(!link.ready||busy||pollBusy)return;pollBusy=true;try{await link.send(P.buildRealtimeRequest(),0x4144);}catch(e){log(e.message);$('lastUpdate').textContent='Не отримано свіжі дані; останні показники можуть бути застарілими';}finally{pollBusy=false;}}
function render(){if(!latest)return;const d=latest;$('co2Value').textContent=d.co2===null?'Прогрів':`${d.co2} ppm`;const low=settings?.alarmLow??800,high=settings?.alarmHigh??1000;$('riskStatus').textContent=d.co2===null?'—':d.co2<low?'Низький':d.co2<high?'Середній':'Високий';$('riskStatus').style.color=d.co2===null?'#94a3b8':d.co2<low?'#10b981':d.co2<high?'#f59e0b':'#ef4444';const c=$('webUnit').value==='C';$('temperature').textContent=d.temperature===null?'—':`${(c?d.temperature:d.temperature*9/5+32).toFixed(1)} °${c?'C':'F'}`;$('humidity').textContent=d.humidity===null?'—':d.humidity+' %';$('battery').textContent=`Акумулятор: приблизно ${d.battery}%${d.charging?' · заряджання':''}`;}
async function readSettings(){
  const f=await link.send(P.buildSettingsGetRequest(),0x4143);const s=P.parseSettings(f);if(!s)throw Error('Неповна відповідь налаштувань');
  settings=s;$('low').value=s.alarmLow;$('high').value=s.alarmHigh;
  // Keep unfamiliar firmware values visible instead of silently replacing them with 120.
  for(const o of [...$('screen').options])if(!['0','120'].includes(o.value))o.remove();
  if(![0,120].includes(s.screenOff))$('screen').add(new Option(`Поточне значення: ${s.screenOff} (одиниця не підтверджена)`,s.screenOff));
  $('screen').value=String(s.screenOff);$('settingsState').textContent=`Зчитано: пороги ${s.alarmLow} / ${s.alarmHigh} ppm; таймер ${s.screenOff}`;render();controls();return s;
}
async function readUnit(){const f=await link.send(P.buildTempUnitGetRequest(),0x216e);const u=P.parseTempUnit(f);if(u===null)throw Error('Неповна відповідь одиниці температури');deviceUnit=u;$('unit').value=u?'C':'F';$('unitState').textContent=`Зчитано з пристрою: °${u?'C':'F'}`;return u;}
async function action(fn){if(busy||!link.ready)return;busy=true;controls();$('actionStatus').textContent='Виконується…';try{$('actionStatus').textContent=await fn();}catch(e){$('actionStatus').textContent='Не підтверджено: '+e.message;log('ПОМИЛКА: '+e.message);}finally{busy=false;controls();}}
link.addEventListener('log',e=>log(e.detail));
link.addEventListener('frame',e=>{if(e.detail.op===0x4144){const d=P.parseRealtime(e.detail.frame);if(d){latest=d;render();$('lastUpdate').textContent='Оновлено: '+new Date().toLocaleTimeString('uk-UA');}}});
link.addEventListener('state',e=>{if(!e.detail){stopTimers();settings=null;deviceUnit=null;latest=null;$('statusDot').classList.remove('connected');$('statusText').textContent='Не підключено';$('lastUpdate').textContent='З’єднання відсутнє';for(const id of ['co2Value','riskStatus','temperature','humidity'])$(id).textContent='—';$('battery').textContent='Акумулятор: —';$('settingsState').textContent='Налаштування ще не зчитано';$('unitState').textContent='Одиницю ще не зчитано';}controls();});
$('connectBtn').onclick=async()=>{if(busy||link.ready)return;busy=true;$('connectBtn').disabled=true;try{
  if(!navigator.bluetooth||!window.isSecureContext)throw Error('Потрібен браузер із Web Bluetooth та HTTPS або localhost');
  $('statusText').textContent='Підключення…';await link.connect();$('statusDot').classList.add('connected');$('statusText').textContent='Підключено: '+link.device.name;
  for(const query of [readSettings,readUnit,async()=>{const f=await link.send(P.buildSoundGetRequest(),0x2723);log('Зумер: '+(P.parseSound(f)?'увімкнений':'вимкнений'));},async()=>{const f=await link.send(P.buildFirmwareRequest(),0x2123);$('deviceInfo').textContent='Прошивка: '+(P.parseFirmware(f)??'невідома');}]){if(!link.ready)break;try{await query();}catch(e){log(e.message);}}
}catch(e){log(e.message);$('statusText').textContent='Помилка: '+e.message;if(link.device)link.disconnect();}finally{busy=false;$('connectBtn').disabled=false;controls();startTimers();await poll();}};
$('disconnectBtn').onclick=()=>link.disconnect();
$('readSettings').onclick=()=>action(async()=>{await readSettings();await readUnit();return 'Налаштування зчитано з датчика';});
$('saveThresholds').onclick=()=>action(async()=>{const low=Number($('low').value),high=Number($('high').value);if(!$('low').value||!$('high').value||!Number.isInteger(low)||!Number.isInteger(high)||low<400||high>5000||low>=high)throw Error('Потрібні цілі пороги 400–5000 ppm; нижній має бути меншим');if(!settings)throw Error('Спочатку зчитайте налаштування');await link.send(P.buildSettingsSetRequest(low,high,settings.screenOff),0x4343);const s=await readSettings();if(s.alarmLow!==low||s.alarmHigh!==high)throw Error('Повторне зчитування не підтвердило пороги');return 'Пороги підтверджено повторним зчитуванням';});
$('saveScreen').onclick=()=>action(async()=>{const target=Number($('screen').value);if(![0,120].includes(target))throw Error('Оберіть 0 або 120');if(!settings)throw Error('Спочатку зчитайте налаштування');
  // Dedicated screen mask 0x20 from the reference implementation. Hardware verification still required.
  await link.send(P.buildScreenOffSetRequest(target),0x4343);const s=await readSettings();if(s.screenOff!==target)throw Error(`Датчик повернув ${s.screenOff} замість ${target}. Таймер не підтверджений для цієї прошивки`);return 'Значення таймера підтверджено зчитуванням. Перевірте дисплей фізично';});
$('saveUnit').onclick=()=>action(async()=>{const target=$('unit').value==='C';await link.send(P.buildTempUnitSetRequest(target),0x2332);if(await readUnit()!==target)throw Error('Пристрій не підтвердив зміну °C/°F');return 'Одиницю температури підтверджено повторним зчитуванням';});
for(const [id,enabled] of [['muteOnBtn',false],['muteOffBtn',true]])$(id).onclick=()=>action(async()=>{await link.send(P.buildSoundSetRequest(enabled),0x2743);const f=await link.send(P.buildSoundGetRequest(),0x2723);if(P.parseSound(f)!==enabled)throw Error('Стан зумера не підтверджений');return enabled?'Звук увімкнено: стан зчитано з датчика':'Звук вимкнено: стан зчитано з датчика';});
$('syncTime').onclick=()=>action(async()=>{await link.send(P.buildTimeSyncRequest(new Date()),0x2342);return 'Отримано відповідь на синхронізацію локального часу браузера';});
$('savePoll').onclick=()=>{const n=Number($('pollSeconds').value);if(!Number.isInteger(n)||n<1||n>300){$('actionStatus').textContent='Інтервал має бути цілим числом від 1 до 300';return;}pollInterval=n;try{localStorage.setItem('htram-poll',String(n));}catch{}startTimers();$('actionStatus').textContent=`Інтервал запитів сайту: ${n} с`;};
$('webUnit').onchange=render;
$('exportLog').onclick=()=>{const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='htram-diagnostic.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
try{const n=Number(localStorage.getItem('htram-poll'));if(Number.isInteger(n)&&n>=1&&n<=300){pollInterval=n;$('pollSeconds').value=n;}}catch{}
window.addEventListener('pagehide',()=>link.disconnect());controls();

