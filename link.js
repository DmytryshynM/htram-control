import * as P from './protocol.js';
export class Link extends EventTarget {
  constructor() {
    super(); this.device=null; this.writer=null; this.reader=null; this.ready=false;
    this.acc=new P.FrameAccumulator(); this.pending=new Map(); this.queue=Promise.resolve(); this.epoch=0;
    this.onData=e=>this.receive(e.target.value); this.onDisconnect=()=>this.cleanup();
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type,{detail})); }
  log(message) { this.emit('log',message); }
  async connect() {
    if(this.device) throw Error('З’єднання вже існує');
    const epoch=++this.epoch;
    this.device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'HTRAM'},{namePrefix:'Honeywell'},{services:[P.SERVICE_UUID]}],optionalServices:[P.SERVICE_UUID]});
    this.device.addEventListener('gattserverdisconnected',this.onDisconnect);
    try {
      const server=await this.device.gatt.connect();
      const service=await server.getPrimaryService(P.SERVICE_UUID);
      this.writer=await service.getCharacteristic(P.WRITE_UUID);
      this.reader=await service.getCharacteristic(P.NOTIFY_UUID);
      this.reader.addEventListener('characteristicvaluechanged',this.onData);
      await this.reader.startNotifications();
      await this.send(P.buildRadioModeRequest(false));
      await new Promise(r=>setTimeout(r,200));
      if(epoch!==this.epoch || !this.device?.gatt.connected) throw Error('З’єднання перервано');
      this.ready=true; this.emit('state',true);
    } catch(e) { this.disconnect(); throw e; }
  }
  send(packet, opcode=null, timeout=3500) {
    const epoch=this.epoch;
    // Serialize complete transactions, including their responses.
    const task=this.queue.catch(()=>{}).then(async()=>{
      if(epoch!==this.epoch || !this.writer || !this.device?.gatt.connected) throw Error('Пристрій від’єднано');
      let waiter;
      const response=opcode===null ? null : new Promise((resolve,reject)=>{
        waiter={resolve,reject,timer:setTimeout(()=>{this.pending.delete(opcode);reject(Error(`Немає відповіді 0x${opcode.toString(16)}`));},timeout)};
        this.pending.set(opcode,waiter);
      });
      // Attach a handler immediately; the timer may fire while a GATT write is pending.
      response?.catch(()=>{});
      try {
        this.log('TX '+P.bytesToHex(packet));
        if(this.writer.properties.write) await this.writer.writeValueWithResponse(packet);
        else if(this.writer.properties.writeWithoutResponse) await this.writer.writeValueWithoutResponse(packet);
        else throw Error('Характеристика не підтримує запис');
        return response ? await response : null;
      } catch(e) {
        if(waiter) { clearTimeout(waiter.timer); this.pending.delete(opcode); waiter.reject(e); }
        throw e;
      }
    });
    this.queue=task; return task;
  }
  receive(view) {
    for(const frame of this.acc.feed(new Uint8Array(view.buffer,view.byteOffset,view.byteLength))) {
      const op=P.frameOpcode(frame); this.log('RX '+P.bytesToHex(frame));
      const waiter=this.pending.get(op);
      if(waiter) {this.pending.delete(op);clearTimeout(waiter.timer);waiter.resolve(frame);}
      this.emit('frame',{op,frame});
    }
  }
  cleanup() {
    ++this.epoch; this.ready=false;
    this.reader?.removeEventListener('characteristicvaluechanged',this.onData);
    this.device?.removeEventListener('gattserverdisconnected',this.onDisconnect);
    this.writer=null; this.reader=null; this.device=null; this.acc.reset();
    for(const w of this.pending.values()){clearTimeout(w.timer);w.reject(Error('Пристрій від’єднано'));}
    this.pending.clear(); this.emit('state',false);
  }
  disconnect() { const device=this.device; this.cleanup(); if(device?.gatt.connected) device.gatt.disconnect(); }
}
