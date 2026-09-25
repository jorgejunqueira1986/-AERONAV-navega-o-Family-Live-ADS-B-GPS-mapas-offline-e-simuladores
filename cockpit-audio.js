/* APP DE NAVEGAÇÃO — Cockpit Audio Cloud helper (RC10.2)
   LiveKit WebRTC transport + Railway token server.
   SECURITY: API key/secret are NEVER present in this file. The browser sends only
   a short role access code to Railway and receives a short-lived participant JWT.
   NOTE: remote audio requires Internet and a physical audio input exposed by the OS/browser. */
(()=>{
  'use strict';

  const VERSION='RC10.2-cloud-audio';
  const SDK_VERSION='2.22.3';
  const SDK_URL=`https://cdn.jsdelivr.net/npm/livekit-client@${SDK_VERSION}/dist/livekit-client.umd.min.js`;
  const DEFAULT_TOKEN_SERVER='https://aeronav-cockpit-token-server-production.up.railway.app';
  const LS_ENDPOINT='aeronav.cockpit.tokenServer';
  const SS_PILOT='aeronav.cockpit.pilotCode';
  const SS_FAMILY='aeronav.cockpit.familyCode';
  const STYLE_ID='aeronav-cockpit-audio-style';

  let sdkPromise=null;
  const roleSessions=new Map();

  function injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .aca-card{margin-top:12px;padding:13px;border:1px solid #1d4a61;border-radius:14px;background:#061925;color:#eef7ff}
      .aca-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.aca-head strong{font-size:14px}.aca-sub{font-size:11px;line-height:1.45;color:#93adbe;margin-top:4px}
      .aca-pill{font-size:9px;font-weight:900;padding:5px 7px;border-radius:999px;background:#4a3412;color:#ffdc8c;white-space:nowrap}.aca-pill.ok{background:#103f37;color:#91f3d5}.aca-pill.bad{background:#3a2530;color:#ffb5cd}.aca-pill.info{background:#123b50;color:#a6e7ff}
      .aca-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.aca-btn{border:1px solid #285974;background:#10344a;color:#dff7ff;border-radius:10px;padding:9px 11px;font-weight:800;cursor:pointer}.aca-btn.primary{border:0;background:linear-gradient(135deg,#2fd1ff,#168bb7);color:#031720}.aca-btn:disabled{opacity:.45;cursor:not-allowed}
      .aca-note{margin-top:10px;padding:9px 10px;border:1px dashed #24566f;border-radius:10px;background:#071722;color:#9db4c3;font-size:10.5px;line-height:1.45}
      .aca-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.aca-field{display:flex;flex-direction:column;gap:4px}.aca-field.full{grid-column:1/-1}.aca-field label{font-size:9px;font-weight:900;color:#87a9ba;letter-spacing:.04em}.aca-field input{background:#07131c;border:1px solid #20495e;color:#eaf8ff;border-radius:9px;padding:9px;font-size:11px;min-width:0}
      .aca-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.aca-kpi{background:#071722;border:1px solid #173c50;border-radius:10px;padding:8px}.aca-kpi span{font-size:8px;color:#7898a9;font-weight:900}.aca-kpi strong{display:block;margin-top:4px;font-size:11px;color:#eef9ff}
      .aca-audio-bin audio{width:100%;margin-top:8px}.aca-hidden{display:none!important}
      @media(max-width:560px){.aca-grid{grid-template-columns:1fr}.aca-field.full{grid-column:auto}.aca-kpis{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(s);
  }

  function endpointValue(){
    return (localStorage.getItem(LS_ENDPOINT)||DEFAULT_TOKEN_SERVER).replace(/\/$/,'');
  }
  function setEndpoint(v){
    const clean=String(v||'').trim().replace(/\/$/,'');
    if(clean) localStorage.setItem(LS_ENDPOINT,clean); else localStorage.removeItem(LS_ENDPOINT);
    return clean||DEFAULT_TOKEN_SERVER;
  }
  function safeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function secureEnough(){return window.isSecureContext || ['localhost','127.0.0.1'].includes(location.hostname);}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

  async function fetchJson(url,init={},timeout=12000){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const r=await fetch(url,{...init,signal:ctl.signal});
      let j={}; try{j=await r.json();}catch(_){ }
      return {r,j};
    }catch(e){
      if(e?.name==='AbortError') throw new Error('Tempo limite excedido ao contactar o servidor.');
      throw e;
    }finally{clearTimeout(timer);}
  }

  function loadSdk(){
    if(window.LivekitClient) return Promise.resolve(window.LivekitClient);
    if(sdkPromise) return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(err)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(err){sdkPromise=null;reject(err);return;}
        if(window.LivekitClient) resolve(window.LivekitClient);
        else {sdkPromise=null;reject(new Error('LiveKit carregou sem expor LivekitClient.'));}
      };
      const timer=setTimeout(()=>finish(new Error('Tempo limite ao carregar LiveKit SDK.')),15000);
      const existing=[...document.scripts].find(x=>x.src===SDK_URL);
      if(existing){
        if(window.LivekitClient){finish();return;}
        existing.addEventListener('load',()=>finish(),{once:true});
        existing.addEventListener('error',()=>finish(new Error('Falha ao carregar LiveKit SDK.')),{once:true});
        return;
      }
      const sc=document.createElement('script');
      sc.src=SDK_URL;sc.async=true;sc.crossOrigin='anonymous';
      sc.onload=()=>finish();
      sc.onerror=()=>finish(new Error('Falha ao carregar LiveKit SDK. Verifique a Internet.'));
      document.head.appendChild(sc);
    });
    return sdkPromise;
  }

  async function health(endpoint){
    const {r,j}=await fetchJson(endpoint.replace(/\/$/,'')+'/health',{cache:'no-store',credentials:'omit'},10000);
    if(!r.ok) throw new Error(`Token server HTTP ${r.status}`);
    if(!j?.ok) throw new Error('Token server respondeu sem estado OK.');
    return j;
  }

  async function getToken(endpoint,role,code){
    if(!code) throw new Error('Introduza o código de acesso deste dispositivo.');
    const {r,j}=await fetchJson(endpoint.replace(/\/$/,'')+'/token',{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'Content-Type':'application/json','X-AeroNav-Code':code},
      body:JSON.stringify({role})
    },12000);
    if(!r.ok){const e=new Error(j?.error||`Token server HTTP ${r.status}`);e.status=r.status;throw e;}
    if(!j?.server_url||!j?.participant_token) throw new Error('Resposta de autenticação incompleta.');
    return j;
  }

  function setStatus(el,text,kind=''){
    if(!el)return;el.textContent=text;el.className='aca-pill'+(kind?' '+kind:'');
  }
  function setNote(el,text){if(el)el.textContent=text;}
  function fmtQuality(q){
    const s=String(q||'').toLowerCase();
    if(s.includes('excellent'))return 'EXCELENTE'; if(s.includes('good'))return 'BOA'; if(s.includes('poor'))return 'FRACA'; if(s.includes('lost'))return 'PERDIDA'; return '—';
  }

  class AudioSession{
    constructor(role){
      this.role=role;this.ui={};this.room=null;this.connected=false;this.connecting=false;
      this.desired=false;this.manualStop=false;this.everConnected=false;
      this.lastCode='';this.lastEndpoint=endpointValue();this.retryTimer=null;this.retryAttempt=0;
      this.statusText='DESLIGADO';this.statusKind='';this.noteText=role==='pilot'?'Pronto para transmitir.':'Pronto para ouvir.';
      this.qualityText='—';this.trackEls=new Map();
    }
    bindUI(ui){
      this.ui=ui||{};
      this._renderState();
      this.updateCounts();
      if(this.role==='family') this._reattachAudio();
    }
    _setStatus(text,kind=''){this.statusText=text;this.statusKind=kind;setStatus(this.ui.status,text,kind);this._updateControls();}
    _setNote(text){this.noteText=text;setNote(this.ui.note,text);}
    _renderState(){
      setStatus(this.ui.status,this.statusText,this.statusKind);
      setNote(this.ui.note,this.noteText);
      if(this.ui.quality)this.ui.quality.textContent=this.qualityText;
      this._updateControls();
    }
    _updateControls(){
      const b=this.ui.startBtn;if(!b)return;
      if(this.connecting){b.disabled=true;b.textContent=this.role==='pilot'?'A ligar…':'A ligar…';return;}
      b.disabled=false;
      if(this.role==='pilot'){
        b.textContent=this.connected?'Transmissão ativa':'Iniciar transmissão';
        b.disabled=this.connected;
      }else if(this.connected){
        b.textContent=this._playbackBlocked()?'▶ Ativar áudio':'✓ Áudio ligado';
      }else b.textContent='▶ Ouvir';
    }
    _playbackBlocked(){
      if(!this.room)return false;
      if('canPlaybackAudio' in this.room) return this.room.canPlaybackAudio===false;
      if('canPlayAudio' in this.room) return this.room.canPlayAudio===false;
      return false;
    }
    updateCounts(){
      const n=this.room?.remoteParticipants?.size||0;
      if(this.ui.listeners)this.ui.listeners.textContent=String(n);
      if(this.ui.participants)this.ui.participants.textContent=String(n);
    }
    _clearRetry(){if(this.retryTimer){clearTimeout(this.retryTimer);this.retryTimer=null;}}
    _scheduleReconnect(){
      if(!this.desired||this.manualStop||!this.everConnected||this.connected||this.connecting)return;
      if(!navigator.onLine){this._setStatus('SEM INTERNET','bad');return;}
      if(this.retryTimer)return;
      const delays=[2000,4000,8000,15000,30000];
      const delay=delays[Math.min(this.retryAttempt,delays.length-1)];this.retryAttempt++;
      this._setStatus('A RECONECTAR','info');
      this.retryTimer=setTimeout(()=>{this.retryTimer=null;this._connect().catch(()=>{});},delay);
    }
    _cleanupRoom(room){
      if(this.room===room)this.room=null;
      this.connected=false;
      for(const [track,el] of this.trackEls){try{track.detach(el)}catch(_){ }try{el.remove()}catch(_){ }}
      this.trackEls.clear();this.updateCounts();
    }
    _attachTrack(track){
      if(!track||this.role!=='family')return;
      let el=this.trackEls.get(track);
      if(!el){
        el=track.attach();el.autoplay=true;el.controls=false;el.playsInline=true;el.className='aca-hidden';
        this.trackEls.set(track,el);
      }
      if(this.ui.audioBin && el.parentNode!==this.ui.audioBin)this.ui.audioBin.appendChild(el);
    }
    _reattachAudio(){
      if(!this.room||this.role!=='family')return;
      for(const [track,el] of this.trackEls){if(this.ui.audioBin&&el.parentNode!==this.ui.audioBin)this.ui.audioBin.appendChild(el);}
      try{
        for(const p of this.room.remoteParticipants.values()){
          for(const pub of p.trackPublications.values()){
            if(pub.track)this._attachTrack(pub.track);
          }
        }
      }catch(_){ }
      this._updateControls();
    }
    _wireRoom(room,LK){
      const RE=LK.RoomEvent;
      room.on(RE.Reconnecting,()=>{if(this.room===room)this._setStatus(navigator.onLine?'A RECONECTAR':'SEM INTERNET',navigator.onLine?'info':'bad');});
      room.on(RE.Reconnected,()=>{if(this.room!==room)return;this.connected=true;this.retryAttempt=0;this._setStatus(this.role==='pilot'?'AO VIVO':(this.trackEls.size&&!this._playbackBlocked()?'AO VIVO':'A LIGAR'),this.role==='pilot'||(this.trackEls.size&&!this._playbackBlocked())?'ok':'info');});
      room.on(RE.Disconnected,()=>{
        if(this.room!==room)return;
        const retry=this.desired&&!this.manualStop&&this.everConnected;
        this._cleanupRoom(room);
        if(retry){this._setStatus(navigator.onLine?'A RECONECTAR':'SEM INTERNET',navigator.onLine?'info':'bad');this._scheduleReconnect();}
        else this._setStatus('DESLIGADO','');
      });
      room.on(RE.ParticipantConnected,()=>this.updateCounts());
      room.on(RE.ParticipantDisconnected,()=>this.updateCounts());
      room.on(RE.ConnectionQualityChanged,(quality,participant)=>{
        if(participant?.isLocal){this.qualityText=fmtQuality(quality);if(this.ui.quality)this.ui.quality.textContent=this.qualityText;}
      });
      room.on(RE.MediaDevicesError,(err)=>{
        if(this.role==='pilot')this._setNote('Microfone indisponível: '+String(err?.message||err||'verifique permissão/dispositivo.'));
      });
      if(this.role==='family'){
        room.on(RE.TrackSubscribed,(track)=>{
          if(track.kind===LK.Track.Kind.Audio){
            this._attachTrack(track);
            if(this._playbackBlocked()){
              this._setStatus('A LIGAR','info');
              this._setNote('O iPhone/Safari bloqueou o áudio automático. Toque em “Ativar áudio”.');
            }else{
              this._setStatus('AO VIVO','ok');
              this._setNote('Áudio remoto recebido. O lado Family é apenas ouvinte e não publica microfone.');
            }
          }
        });
        room.on(RE.TrackUnsubscribed,(track)=>{
          const el=this.trackEls.get(track);if(el){try{track.detach(el)}catch(_){ }try{el.remove()}catch(_){ }this.trackEls.delete(track);}
          if(this.connected&&this.trackEls.size===0)this._setStatus('A LIGAR','info');
        });
        room.on(RE.AudioPlaybackStatusChanged,()=>{
          if(this._playbackBlocked()){
            this._setStatus('A LIGAR','info');
            this._setNote('O navegador bloqueou a reprodução automática. Toque em “Ativar áudio”.');
          }else if(this.trackEls.size){
            this._setStatus('AO VIVO','ok');
            this._setNote('Áudio remoto ativo. O lado Family continua listen-only.');
          }
          this._updateControls();
        });
      }
    }
    async _connect(){
      if(this.connected||this.connecting)return;
      if(!this.desired)return;
      if(!navigator.onLine){this._setStatus('SEM INTERNET','bad');return;}
      if(this.role==='pilot'&&!secureEnough()){this._setStatus('ERRO','bad');throw new Error('O microfone requer HTTPS.');}
      this.connecting=true;this._clearRetry();this._setStatus(this.everConnected?'A RECONECTAR':'A LIGAR','info');
      let room=null;
      try{
        const LK=await loadSdk();
        if(LK.isBrowserSupported && !LK.isBrowserSupported()) throw new Error('Este navegador não suporta as APIs WebRTC exigidas pelo LiveKit.');
        await health(this.lastEndpoint);
        const auth=await getToken(this.lastEndpoint,this.role,this.lastCode);
        if(!this.desired)return;
        room=new LK.Room({adaptiveStream:false,dynacast:false,disconnectOnPageLeave:true});
        this.room=room;this._wireRoom(room,LK);
        await room.connect(auth.server_url,auth.participant_token,{autoSubscribe:this.role==='family'});
        if(!this.desired){room.disconnect();return;}
        this.connected=true;this.retryAttempt=0;this.updateCounts();
        if(this.role==='pilot'){
          await room.localParticipant.setMicrophoneEnabled(true,{echoCancellation:false,noiseSuppression:false,autoGainControl:false});
          this.everConnected=true;
          this._setStatus('AO VIVO','ok');
          this._setNote('Transmissão WebRTC ativa. A fonte é o input de áudio exposto pelo sistema. Para rádio/intercom, use uma interface física compatível e teste em solo.');
        }else{
          this.everConnected=true;
          this._reattachAudio();
          this._setStatus(this.trackEls.size&&!this._playbackBlocked()?'AO VIVO':'A LIGAR',this.trackEls.size&&!this._playbackBlocked()?'ok':'info');
          this._setNote(this._playbackBlocked()?'Toque em “Ativar áudio” para autorizar o Safari/iPhone.':'Ligado em modo listen-only. Aguardando áudio do Pilot.');
        }
      }catch(e){
        if(room){try{room.disconnect()}catch(_){ }}
        if(this.room===room)this._cleanupRoom(room);
        const mediaStop=this.role==='pilot'&&['NotAllowedError','NotFoundError','NotReadableError','OverconstrainedError','SecurityError'].includes(e?.name);
        const authStop=[400,401,403].includes(Number(e?.status));
        if(mediaStop||authStop){
          this.desired=false;this._clearRetry();this._setStatus('ERRO','bad');
          this._setNote(mediaStop?'Microfone não disponível ou sem permissão. Corrija a permissão/dispositivo e toque novamente em “Iniciar transmissão”.':String(e?.message||e));
        }else if(this.everConnected&&this.desired&&!this.manualStop){
          this._setStatus(navigator.onLine?'A RECONECTAR':'SEM INTERNET',navigator.onLine?'info':'bad');
          this._setNote('Ligação interrompida: '+String(e?.message||e)+'. AERONAV tentará novamente.');
        }else{
          this._setStatus('ERRO','bad');this._setNote(String(e?.message||e));
        }
        throw e;
      }finally{
        this.connecting=false;this._updateControls();
        // Schedule only after clearing connecting; otherwise the retry guard rejects it.
        this._scheduleReconnect();
      }
    }
    async connect(code,endpoint){
      this.lastCode=String(code||'').trim();this.lastEndpoint=String(endpoint||DEFAULT_TOKEN_SERVER).replace(/\/$/,'');
      this.desired=true;this.manualStop=false;
      if(this.connected){
        if(this.role==='family')return this.resumeAudioFromGesture();
        return;
      }
      return this._connect();
    }
    async resumeAudioFromGesture(){
      if(this.role!=='family'||!this.room)return;
      try{
        if(typeof this.room.startAudio==='function') await this.room.startAudio();
        if(this.trackEls.size){this._setStatus('AO VIVO','ok');this._setNote('Áudio remoto ativo. O Viewer continua listen-only.');}
        else {this._setStatus('A LIGAR','info');this._setNote('Áudio autorizado. Aguardando transmissão do Pilot.');}
      }catch(e){this._setStatus('ERRO','bad');this._setNote('Não foi possível ativar a reprodução de áudio: '+String(e?.message||e));throw e;}
      finally{this._updateControls();}
    }
    async disconnect(){
      this.desired=false;this.manualStop=true;this._clearRetry();
      const room=this.room;
      try{if(room?.localParticipant?.isMicrophoneEnabled)await room.localParticipant.setMicrophoneEnabled(false);}catch(_){ }
      try{room?.disconnect();}catch(_){ }
      if(room&&this.room===room)this._cleanupRoom(room);
      this.connecting=false;this._setStatus('DESLIGADO','');this._setNote(this.role==='pilot'?'Transmissão parada.':'Viewer desligado.');
    }
    onOffline(){if(this.desired)this._setStatus('SEM INTERNET','bad');}
    onOnline(){
      if(!this.desired)return;
      if(this.connected){const live=this.role==='pilot'||(this.trackEls.size&&!this._playbackBlocked());this._setStatus(this.role==='pilot'?'AO VIVO':(live?'AO VIVO':'A LIGAR'),live?'ok':'info');return;}
      if(this.everConnected&&!this.connecting){this._setStatus('A RECONECTAR','info');this._connect().catch(()=>{});}
    }
  }

  function sessionFor(role){
    if(!roleSessions.has(role))roleSessions.set(role,new AudioSession(role));
    return roleSessions.get(role);
  }

  function baseForm(role){
    const endpoint=safeText(endpointValue());
    const codeKey=role==='pilot'?SS_PILOT:SS_FAMILY;
    const code=safeText(sessionStorage.getItem(codeKey)||'');
    return `<div class="aca-grid"><div class="aca-field full"><label>TOKEN SERVER</label><input data-endpoint value="${endpoint}" inputmode="url" autocomplete="off"></div><div class="aca-field full"><label>CÓDIGO DE ACESSO ${role==='pilot'?'PILOT':'FAMILY'}</label><input data-code type="password" value="${code}" autocomplete="off" placeholder="Código guardado no Railway"></div></div>`;
  }

  function mountPilot(selector){
    injectStyle();const host=document.querySelector(selector);if(!host)return;
    host.innerHTML=`<section class="aca-card"><div class="aca-head"><div><strong>🎙 Cockpit Audio · Railway</strong><div class="aca-sub">WebRTC via LiveKit Cloud + token server Railway. Publicação de áudio apenas pelo Pilot.</div></div><span class="aca-pill" data-status>DESLIGADO</span></div>${baseForm('pilot')}<div class="aca-kpis"><div class="aca-kpi"><span>FUNÇÃO</span><strong>PILOT TX</strong></div><div class="aca-kpi"><span>OUVINTES</span><strong data-listeners>0</strong></div><div class="aca-kpi"><span>QUALIDADE</span><strong data-quality>—</strong></div></div><div class="aca-actions"><button class="aca-btn primary" type="button" data-start>Iniciar transmissão</button><button class="aca-btn" type="button" data-test>Testar servidor</button><button class="aca-btn" type="button" data-stop>Parar</button></div><div class="aca-note" data-note>Não coloque API Key/Secret aqui. O código Pilot autentica no Railway e o browser recebe apenas um token temporário.</div></section>`;
    const ui={status:host.querySelector('[data-status]'),listeners:host.querySelector('[data-listeners]'),quality:host.querySelector('[data-quality]'),note:host.querySelector('[data-note]'),startBtn:host.querySelector('[data-start]')};
    const session=sessionFor('pilot');session.bindUI(ui);const codeKey=SS_PILOT;
    const endpoint=()=>setEndpoint(host.querySelector('[data-endpoint]').value);
    const code=()=>{const v=host.querySelector('[data-code]').value.trim();if(v)sessionStorage.setItem(codeKey,v);else sessionStorage.removeItem(codeKey);return v;};
    ui.startBtn.onclick=async()=>{try{await session.connect(code(),endpoint());}catch(_){ }};
    host.querySelector('[data-test]').onclick=async()=>{try{session._setStatus('A LIGAR','info');await health(endpoint());session._setStatus(session.connected?'AO VIVO':'DESLIGADO',session.connected?'ok':'');session._setNote('Token server Railway respondeu corretamente.');}catch(e){session._setStatus('ERRO','bad');session._setNote(String(e?.message||e));}};
    host.querySelector('[data-stop]').onclick=()=>session.disconnect();
  }

  function mountViewer(selector){
    injectStyle();const host=document.querySelector(selector);if(!host)return;
    host.innerHTML=`<section class="aca-card"><div class="aca-head"><div><strong>🎧 Cockpit Audio · Family</strong><div class="aca-sub">Ligação privada listen-only ao áudio publicado pelo dispositivo Pilot.</div></div><span class="aca-pill" data-status>DESLIGADO</span></div>${baseForm('family')}<div class="aca-kpis"><div class="aca-kpi"><span>FUNÇÃO</span><strong>FAMILY RX</strong></div><div class="aca-kpi"><span>REMOTOS</span><strong data-participants>0</strong></div><div class="aca-kpi"><span>ÁUDIO DE VOLTA</span><strong>BLOQUEADO</strong></div></div><div class="aca-actions"><button class="aca-btn primary" type="button" data-start>▶ Ouvir</button><button class="aca-btn" type="button" data-test>Testar servidor</button><button class="aca-btn" type="button" data-stop>Desligar</button></div><div class="aca-note" data-note>O Viewer não recebe permissão para publicar microfone. O áudio depende de Internet disponível em ambos os lados.</div><div class="aca-audio-bin" data-audio-bin></div></section>`;
    const ui={status:host.querySelector('[data-status]'),participants:host.querySelector('[data-participants]'),note:host.querySelector('[data-note]'),audioBin:host.querySelector('[data-audio-bin]'),startBtn:host.querySelector('[data-start]')};
    const session=sessionFor('family');session.bindUI(ui);const codeKey=SS_FAMILY;
    const endpoint=()=>setEndpoint(host.querySelector('[data-endpoint]').value);
    const code=()=>{const v=host.querySelector('[data-code]').value.trim();if(v)sessionStorage.setItem(codeKey,v);else sessionStorage.removeItem(codeKey);return v;};
    ui.startBtn.onclick=async()=>{
      try{
        // When already connected this call invokes room.startAudio() directly from the tap,
        // which is required by Safari/iOS autoplay policy.
        if(session.connected){await session.resumeAudioFromGesture();return;}
        await session.connect(code(),endpoint());
      }catch(_){ }
    };
    host.querySelector('[data-test]').onclick=async()=>{try{session._setStatus('A LIGAR','info');await health(endpoint());session._setStatus(session.connected?(session.trackEls.size?'AO VIVO':'A LIGAR'):'DESLIGADO',session.connected&&session.trackEls.size?'ok':session.connected?'info':'');session._setNote('Token server Railway respondeu corretamente.');}catch(e){session._setStatus('ERRO','bad');session._setNote(String(e?.message||e));}};
    host.querySelector('[data-stop]').onclick=()=>session.disconnect();
  }

  async function stopAll(){for(const s of roleSessions.values())await s.disconnect().catch(()=>{});}
  window.addEventListener('offline',()=>{for(const s of roleSessions.values())s.onOffline();});
  window.addEventListener('online',()=>{for(const s of roleSessions.values())s.onOnline();});
  window.addEventListener('pagehide',()=>{stopAll();});
  window.AERONAVCockpitAudio={mountPilot,mountViewer,stop:stopAll,health,version:VERSION,sdkVersion:SDK_VERSION,defaultTokenServer:DEFAULT_TOKEN_SERVER};
})();
