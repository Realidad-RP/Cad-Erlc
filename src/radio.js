// ============================================================
//  Radio de voz (cliente WebRTC) — CAD | AYUNTAMIENTO | Los Angeles
// ============================================================
// Este archivo se encarga de:
//   - Conectarse al servidor de radio (el que aloja la app o uno suelto)
//   - Entrar y salir de canales
//   - Conectar el audio DIRECTO con cada compañero (red en malla WebRTC)
//   - Push-to-talk: el micrófono está cerrado y solo se abre al pulsar la tecla
//
// El audio NO pasa por el servidor: viaja de PC a PC (peer-to-peer).
// El servidor solo presenta a los compañeros entre sí ("señalización").

(function () {
  // Servidores STUN públicos: ayudan a descubrir la dirección de cada PC.
  // El servidor de radio puede enviar otros (incluido TURN) al conectarse.
  const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  // Canales de ejemplo (se muestran cuando no hay conexión; el servidor envía los reales)
  const DEFAULT_CHANNELS = [
    { name: 'Despacho Central',     department: null,       private: false, category: 'Central' },
    { name: 'Policía (LCPD)',       department: 'LCPD',     private: false, category: 'Departamentos' },
    { name: 'Highway Patrol (CHP)', department: 'CHP',      private: false, category: 'Departamentos' },
    { name: 'Bomberos/EMS (LCFD)',  department: 'LCFD',     private: false, category: 'Departamentos' },
    { name: 'Transporte (DOT)',     department: 'DOT',      private: false, category: 'Departamentos' },
    { name: 'Central 9-1-1',        department: 'DISPATCH', private: false, category: 'Departamentos' },
    { name: 'Táctico 1',            department: null,       private: false, category: 'Operaciones' },
    { name: 'Táctico 2',            department: null,       private: false, category: 'Operaciones' },
  ];

  // Caché de canales: si el servidor se reinicia y olvida los canales creados,
  // la primera app que se conecte se los devuelve automáticamente.
  const CHANNEL_CACHE_KEY = 'cad-erlc-channels-cache';

  const state = {
    ws: null,
    connected: false,
    myId: null,
    name: '',
    department: 'DISPATCH',
    role: 'Miembro',       // lo asigna el propietario del servidor
    isOwner: false,
    ownerExists: false,
    ownerName: null,
    serverUrl: '',
    channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
    channel: null,
    members: new Map(), // id -> { id, name, department, talking }
    userlist: [],       // todos los conectados al servidor (para invitar)
    peers: new Map(),   // id -> { pc, pendingCandidates, audio, initiated }
    iceServers: [...DEFAULT_ICE_SERVERS],
    localStream: null,
    pttActive: false,
    // Modo compatibilidad: el audio viaja por el WebSocket del servidor.
    // Se activa solo cuando WebRTC no logra conectar entre dos PCs.
    relay: false,
    relayReason: '',
    relayRequested: false,
    relayCtx: null,
    relaySource: null,
    relayProcessor: null,
    relaySilentGain: null,
    relayOutGain: null,
    relayNextTime: 0,
    settings: { pttKey: 'V', pttMode: 'hold', volume: 1, micDeviceId: '', outputDeviceId: '' },
    onEvent: null,
  };

  function emit(event, payload) {
    if (typeof state.onEvent === 'function') state.onEvent(event, payload);
  }

  function send(obj) {
    if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(obj));
  }

  function emitRoster() {
    const others = [...state.members.values()].filter((m) => m.id !== state.myId);
    emit('roster', others);
  }

  // ---------------- Caché de canales ----------------
  function readChannelCache() {
    try {
      const arr = JSON.parse(localStorage.getItem(CHANNEL_CACHE_KEY) || 'null');
      return Array.isArray(arr) && arr.length ? arr : null;
    } catch { return null; }
  }

  function writeChannelCache(list) {
    try {
      const prev = readChannelCache() || [];
      const prevByName = new Map(prev.map((c) => [c.name, c]));
      const simple = list.map((c) => {
        const old = prevByName.get(c.name);
        const members = Array.isArray(c.memberNames)
          ? c.memberNames
          : (old && Array.isArray(old.members) ? old.members : []);
        return { name: c.name, department: c.department || null, private: !!c.private, members };
      });
      localStorage.setItem(CHANNEL_CACHE_KEY, JSON.stringify(simple));
    } catch {}
  }

  function channelKeyOf(list) {
    return (list || [])
      .map((c) => `${c.name}|${c.department || ''}|${c.private ? 'P' : 'A'}`)
      .sort()
      .join('\n');
  }

  // ---------------- Conexión al servidor ----------------
  function connect(url, name, department, ownerPassword) {
    return new Promise((resolve) => {
      disconnect(true); // por si había una conexión anterior
      state.serverUrl = url;
      state.name = name;
      state.department = department;

      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        emit('error', 'Dirección de servidor inválida: ' + err.message);
        resolve(false);
        return;
      }
      state.ws = ws;
      ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        if (!state.connected) {
          emit('error', 'No se pudo conectar al servidor (¿está encendido y accesible?).');
          try { ws.close(); } catch {}
          resolve(false);
        }
      }, 8000);

      ws.onopen = () => {
        clearTimeout(timeout);
        state.connected = true;
        send({ type: 'hello', name, department, ownerPassword: ownerPassword || '' });
        emit('connected', { url });
        resolve(true);
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
          handleRelayAudio(ev.data);
          return;
        }
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        handleMessage(msg);
      };

      ws.onerror = () => {
        if (!state.connected) emit('error', 'Error de conexión con el servidor de radio.');
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        const wasConnected = state.connected;
        state.connected = false;
        state.myId = null;
        state.channel = null;
        state.members.clear();
        state.userlist = [];
        state.isOwner = false;
        resetRelay();
        closeAllPeers();
        emit('disconnected');
        if (!wasConnected) resolve(false);
      };
    });
  }

  function disconnect(silent) {
    if (state.ws) {
      const ws = state.ws;
      state.ws = null;
      try {
        if (state.channel) ws.send(JSON.stringify({ type: 'leave' }));
        ws.onclose = null;
        ws.close();
      } catch {}
    }
    state.connected = false;
    state.myId = null;
    state.channel = null;
    state.members.clear();
    state.userlist = [];
    state.isOwner = false;
    resetRelay();
    closeAllPeers();
    if (!silent) emit('disconnected');
  }

  // ---------------- Mensajes del servidor ----------------
  function handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        state.myId = msg.id;
        if (typeof msg.role === 'string') state.role = msg.role;
        state.isOwner = state.role === 'Propietario';
        state.ownerExists = !!msg.ownerExists;
        state.ownerName = msg.ownerName || null;
        if (Array.isArray(msg.channels) && msg.channels.length) state.channels = msg.channels;
        // El servidor puede enviar STUN/TURN configurados (para internet)
        if (Array.isArray(msg.iceServers) && msg.iceServers.length) {
          state.iceServers = msg.iceServers;
        }
        emit('channels', state.channels);
        emit('owner', {
          owner: state.isOwner,
          ownerExists: state.ownerExists,
          ownerName: state.ownerName,
          rolesFresh: false,
        });
        // Si el servidor acaba de arrancar (sin canales guardados), los restauramos
        if (msg.channelsFresh) {
          const cached = readChannelCache();
          if (cached && channelKeyOf(cached) !== channelKeyOf(msg.channels || [])) {
            send({ type: 'channels-restore', channels: cached });
          }
        }
        break;

      case 'joined': {
        state.channel = msg.channel;
        state.members.clear();
        for (const m of msg.members || []) state.members.set(m.id, m);
        state.relayRequested = false;
        emit('joined', msg.channel);
        emitRoster();
        // Al ser los recién llegados, NOSOTROS iniciamos la conexión con cada uno
        ensureMic().then((okMic) => {
          if (!okMic) return;
          if (msg.relay) {
            state.relayRequested = true;
            enableRelay('El canal está en modo compatibilidad.').catch((err) =>
              emit('error', 'No se pudo iniciar el modo compatibilidad: ' + err.message)
            );
            return;
          }
          for (const m of msg.members || []) {
            if (m.id !== state.myId) initiatePeer(m.id);
          }
          scheduleFallbackCheck(msg.members);
        });
        break;
      }

      case 'peer-joined': {
        // Alguien nuevo entró: esperamos SU oferta (él inicia la conexión)
        if (msg.member) state.members.set(msg.member.id, msg.member);
        emitRoster();
        // Si la versión del recién llegado es vieja, quizá nunca pida el modo
        // compatibilidad. Vigilamos igual desde este lado.
        if (state.channel && !state.relay) scheduleFallbackCheck([...state.members.values()]);
        break;
      }

      case 'peer-left': {
        state.members.delete(msg.id);
        closePeer(msg.id);
        emitRoster();
        break;
      }

      case 'roster': {
        state.members.clear();
        for (const m of msg.members || []) state.members.set(m.id, m);
        emitRoster();
        break;
      }

      case 'userlist':
        state.userlist = Array.isArray(msg.users) ? msg.users : [];
        emit('userlist', state.userlist);
        break;

      case 'channels':
        state.channels = msg.channels || [];
        writeChannelCache(state.channels);
        emit('channels', state.channels);
        break;

      // El servidor avisa que este canal pasó a modo compatibilidad (el audio
      // viaja por el WebSocket). Todos los miembros cambian al mismo tiempo.
      case 'relay-mode':
        if (msg.enabled) {
          state.relayRequested = true;
          enableRelay(msg.reason || 'No se pudo conectar el audio directo.').catch((err) =>
            emit('error', 'No se pudo iniciar el modo compatibilidad: ' + err.message)
          );
        }
        break;

      case 'kicked':
        // Nos sacaron del canal (por ejemplo, lo eliminó un supervisor)
        state.channel = null;
        resetRelay();
        closeAllPeers();
        state.members.clear();
        emitRoster();
        emit('kicked', msg.reason || 'Te sacaron del canal.');
        break;

      case 'owner-status':
        state.isOwner = !!msg.owner;
        state.ownerExists = !!msg.ownerExists;
        if (msg.ownerName) state.ownerName = msg.ownerName;
        emit('owner', msg);
        break;

      case 'role-changed':
        state.role = msg.role || 'Miembro';
        state.isOwner = state.role === 'Propietario';
        emit('role', state.role);
        break;

      case 'error':
        emit('error', msg.message || 'Error del servidor de radio.');
        break;

      case 'signal': {
        handleSignal(msg.from, msg.data).catch((err) =>
          emit('error', 'Error de audio: ' + err.message)
        );
        break;
      }

      case 'peer-talking': {
        const m = state.members.get(msg.id);
        if (m) {
          m.talking = !!msg.talking;
          emitRoster();
        }
        break;
      }

      case 'chat':
        emit('chat', msg);
        break;

      case 'panic':
        emit('panic', msg);
        break;

      case 'panic-clear':
        emit('panic-clear', msg);
        break;

      case 'civil-call':
        emit('civil-call', msg.call);
        break;
    }
  }

  // ---------------- Micrófono ----------------
  function micConstraints() {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (state.settings.micDeviceId) audio.deviceId = { exact: state.settings.micDeviceId };
    return { audio };
  }

  async function acquireMic() {
    try {
      return await navigator.mediaDevices.getUserMedia(micConstraints());
    } catch (err) {
      // Si el micrófono elegido ya no existe, usar el predeterminado
      if (state.settings.micDeviceId) {
        state.settings.micDeviceId = '';
        emit('error', 'El micrófono elegido no está disponible; se usará el predeterminado.');
        return await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      }
      throw err;
    }
  }

  async function ensureMic() {
    if (state.localStream) return true;
    try {
      state.localStream = await acquireMic();
      // El micrófono arranca CERRADO; solo se abre al pulsar el PTT
      for (const t of state.localStream.getAudioTracks()) t.enabled = false;
      emit('mic', true);
      return true;
    } catch (err) {
      emit('error', 'No se pudo acceder al micrófono: ' + err.message);
      return false;
    }
  }

  // ---------------- Modo compatibilidad (audio por WebSocket) ----------------
  // WebRTC conecta las PCs directamente, pero algunas redes (CGNAT, firewalls
  // escolares/corporativos) bloquean el audio. En ese caso el canal cambia a
  // este modo: el micrófono se convierte a PCM 16 kHz y el servidor lo
  // retransmite a los demás por el mismo WebSocket que ya está conectado.

  function downsampleToPcm16(input, inputRate) {
    const target = 16000;
    const ratio = inputRate / target;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const out = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      const value = sum / (end - start);
      out[i] = Math.max(-1, Math.min(1, value)) * 32767;
    }
    return out;
  }

  async function startRelayAudio() {
    if (state.relayCtx) return true;
    if (!state.localStream) {
      const okMic = await ensureMic();
      if (!okMic) return false;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(state.localStream);
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    const output = ctx.createGain();
    output.gain.value = state.settings.volume;
    source.connect(processor);
    processor.connect(silent);
    silent.connect(ctx.destination);
    output.connect(ctx.destination);
    processor.onaudioprocess = (event) => {
      if (!state.relay || !state.pttActive || !state.connected || !state.channel) return;
      const pcm = downsampleToPcm16(event.inputBuffer.getChannelData(0), ctx.sampleRate);
      if (state.ws && state.ws.readyState === 1) state.ws.send(pcm.buffer);
    };
    state.relayCtx = ctx;
    state.relaySource = source;
    state.relayProcessor = processor;
    state.relaySilentGain = silent;
    state.relayOutGain = output;
    state.relayNextTime = 0;
    if (ctx.setSinkId) {
      ctx.setSinkId(state.settings.outputDeviceId || 'default').catch(() => {});
    }
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }
    return true;
  }

  function stopRelayAudio() {
    try { if (state.relayProcessor) state.relayProcessor.disconnect(); } catch {}
    try { if (state.relaySource) state.relaySource.disconnect(); } catch {}
    try { if (state.relaySilentGain) state.relaySilentGain.disconnect(); } catch {}
    try { if (state.relayOutGain) state.relayOutGain.disconnect(); } catch {}
    try { if (state.relayCtx) state.relayCtx.close(); } catch {}
    state.relayCtx = null;
    state.relaySource = null;
    state.relayProcessor = null;
    state.relaySilentGain = null;
    state.relayOutGain = null;
    state.relayNextTime = 0;
  }

  let fallbackTimer = null;

  function clearFallbackTimer() {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function resetRelay() {
    state.relay = false;
    state.relayReason = '';
    state.relayRequested = false;
    stopRelayAudio();
    clearFallbackTimer();
    for (const entry of state.peers.values()) {
      if (entry.audio) entry.audio.muted = false;
    }
  }

  async function enableRelay(reason) {
    if (state.relay) return true;
    if (!state.channel) return false;
    state.relay = true;
    state.relayReason = reason || '';
    state.relayRequested = true;
    clearFallbackTimer();
    // No cerramos las conexiones WebRTC: si funcionan, las silenciamos para
    // no escuchar dos veces. Así las versiones viejas de la app siguen oyendo.
    for (const entry of state.peers.values()) {
      if (entry.audio) entry.audio.muted = true;
    }
    emit('relay', { enabled: true, reason: state.relayReason });
    const ok = await startRelayAudio();
    if (!ok) {
      state.relay = false;
      stopRelayAudio();
      emit('relay', { enabled: false, reason: 'No se pudo abrir el micrófono.' });
    }
    return ok;
  }

  function requestRelay(reason) {
    if (state.relay || state.relayRequested || !state.channel || !state.connected) return;
    state.relayRequested = true;
    send({ type: 'relay-needed', reason: reason || '' });
    emit('relay-request', { reason: reason || '' });
  }

  function scheduleFallbackCheck(members) {
    clearFallbackTimer();
    const others = (members || []).filter((m) => m.id !== state.myId);
    if (!others.length) return;
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (state.relay || !state.channel) return;
      const notConnected = others.some((m) => {
        const entry = state.peers.get(m.id);
        return !entry || entry.pc.connectionState !== 'connected';
      });
      if (notConnected) requestRelay('La conexión directa no se completó.');
    }, 8000);
  }

  function handleRelayAudio(data) {
    if (!state.relay || !state.relayCtx || !state.relayOutGain) return;
    const buffer = data instanceof ArrayBuffer ? data : (data && data.buffer ? data.buffer : null);
    if (!buffer || buffer.byteLength < 2) return;
    const samples = Math.floor(buffer.byteLength / 2);
    const view = new DataView(buffer);
    const audioBuffer = state.relayCtx.createBuffer(1, samples, 16000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    const src = state.relayCtx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(state.relayOutGain);
    const now = state.relayCtx.currentTime;
    let when = state.relayNextTime;
    if (!when || when < now - 0.2 || when > now + 1.5) when = now + 0.06;
    if (when < now + 0.02) when = now + 0.02;
    src.start(when);
    state.relayNextTime = when + audioBuffer.duration;
  }

  // ---------------- Conexiones de audio (WebRTC) ----------------
  function initiatePeer(id) {
    const entry = getOrCreatePeer(id);
    if (entry.initiated) return;
    entry.initiated = true;
    (async () => {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      send({ type: 'signal', to: id, data: { offer: entry.pc.localDescription } });
    })().catch((err) => emit('error', 'No se pudo iniciar el audio con un compañero: ' + err.message));
  }

  function getOrCreatePeer(id) {
    if (state.peers.has(id)) return state.peers.get(id);

    const pc = new RTCPeerConnection({ iceServers: state.iceServers });
    const entry = { pc, pendingCandidates: [], audio: null, initiated: false };
    state.peers.set(id, entry);

    if (state.localStream) {
      for (const track of state.localStream.getAudioTracks()) {
        pc.addTrack(track, state.localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'signal', to: id, data: { candidate: e.candidate } });
    };

    pc.ontrack = (e) => {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.volume = state.settings.volume;
      audio.muted = state.relay; // en modo compatibilidad escuchamos por el WebSocket
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
      // Enviar la voz al dispositivo de salida elegido (parlantes/auriculares)
      if (audio.setSinkId) {
        audio.setSinkId(state.settings.outputDeviceId || 'default').catch(() => {});
      }
      entry.audio = audio;
      const box = document.getElementById('audio-container');
      if (box) box.appendChild(audio);
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      emit('peer-state', { id, connectionState });
      if (state.relay) return;
      if (connectionState === 'failed') {
        requestRelay('Falló la conexión directa.');
        try { pc.restartIce(); } catch {}
      } else if (connectionState === 'disconnected') {
        setTimeout(() => {
          if (!state.relay && pc.connectionState === 'disconnected') {
            requestRelay('La conexión directa se cortó.');
          }
        }, 5000);
      }
    };

    return entry;
  }

  async function handleSignal(from, data) {
    if (!data) return;
    const entry = getOrCreatePeer(from);
    const pc = entry.pc;

    if (data.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      await flushCandidates(entry);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'signal', to: from, data: { answer: pc.localDescription } });
    } else if (data.answer) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushCandidates(entry);
    } else if (data.candidate) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
      } else {
        entry.pendingCandidates.push(data.candidate);
      }
    }
  }

  async function flushCandidates(entry) {
    for (const c of entry.pendingCandidates.splice(0)) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
  }

  function closePeer(id) {
    const entry = state.peers.get(id);
    if (!entry) return;
    try { entry.pc.close(); } catch {}
    if (entry.audio) { try { entry.audio.remove(); } catch {} }
    state.peers.delete(id);
  }

  function closeAllPeers() {
    for (const id of [...state.peers.keys()]) closePeer(id);
  }

  // ---------------- Entrar / salir de canales ----------------
  async function joinChannel(channel) {
    if (!state.connected) {
      emit('error', 'Primero conéctate al servidor de radio.');
      return false;
    }
    if (state.channel === channel) return true;
    const micOk = await ensureMic();
    if (!micOk) return false;
    if (state.channel) {
      send({ type: 'leave' });
      closeAllPeers();
      state.members.clear();
      emitRoster();
    }
    resetRelay();
    send({ type: 'join', channel });
    return true;
  }

  function leaveChannel() {
    if (!state.channel) return;
    send({ type: 'leave' });
    closeAllPeers();
    state.channel = null;
    state.members.clear();
    resetRelay();
    emitRoster();
    emit('left');
  }

  // ---------------- Push-to-talk ----------------
  function pttDown() {
    if (state.pttActive) return;
    if (!state.channel || !state.localStream) {
      emit('ptt-blocked');
      return;
    }
    if (state.relay && state.relayCtx && state.relayCtx.state === 'suspended') {
      state.relayCtx.resume().catch(() => {});
    }
    state.pttActive = true;
    for (const t of state.localStream.getAudioTracks()) t.enabled = true;
    send({ type: 'talking', talking: true });
    emit('ptt', true);
  }

  function pttUp() {
    if (!state.pttActive) return;
    state.pttActive = false;
    if (state.localStream) {
      for (const t of state.localStream.getAudioTracks()) t.enabled = false;
    }
    send({ type: 'talking', talking: false });
    emit('ptt', false);
  }

  // ---------------- Ajustes ----------------
  function setSettings(partial) {
    Object.assign(state.settings, partial || {});
    if (window.cadNative && window.cadNative.setPttConfig) {
      window.cadNative.setPttConfig({ key: state.settings.pttKey, mode: state.settings.pttMode });
    }
  }

  function setVolume(v) {
    state.settings.volume = v;
    if (state.relayOutGain) state.relayOutGain.gain.value = v;
    for (const entry of state.peers.values()) {
      if (entry.audio) entry.audio.volume = v;
    }
  }

  // Cambiar el micrófono en caliente (sin salir del canal)
  async function setMicDevice(deviceId) {
    state.settings.micDeviceId = deviceId || '';
    if (!state.localStream) return true; // se aplicará al conectar
    try {
      const stream = await acquireMic();
      for (const t of stream.getAudioTracks()) t.enabled = state.pttActive;
      for (const entry of state.peers.values()) {
        if (entry.pc.signalingState === 'closed') continue;
        const sender = entry.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
        if (sender) await sender.replaceTrack(stream.getAudioTracks()[0]).catch(() => {});
        else entry.pc.addTrack(stream.getAudioTracks()[0], stream);
      }
      for (const t of state.localStream.getAudioTracks()) t.stop();
      state.localStream = stream;
      if (state.relay) {
        stopRelayAudio();
        startRelayAudio().catch((err) =>
          emit('error', 'No se pudo reiniciar el modo compatibilidad: ' + err.message)
        );
      }
      emit('mic', true);
      return true;
    } catch (err) {
      emit('error', 'No se pudo cambiar el micrófono: ' + err.message);
      return false;
    }
  }

  // Cambiar dónde se escucha la radio (parlantes/auriculares)
  async function setOutputDevice(deviceId) {
    state.settings.outputDeviceId = deviceId || '';
    const id = state.settings.outputDeviceId || 'default';
    if (state.relayCtx && state.relayCtx.setSinkId) {
      state.relayCtx.setSinkId(id).catch(() => {});
    }
    for (const entry of state.peers.values()) {
      if (entry.audio && entry.audio.setSinkId) {
        entry.audio.setSinkId(id).catch(() => {});
      }
    }
  }

  function sendChat(text) {
    if (!state.channel) {
      emit('error', 'Entra a un canal para usar el chat de radio.');
      return;
    }
    send({ type: 'chat', text });
  }

  // ---------------- Botón de pánico ----------------
  function sendPanic(note) {
    if (!state.connected) {
      emit('error', 'Conéctate al radio para poder pedir ayuda.');
      return;
    }
    send({ type: 'panic', note: String(note || '').slice(0, 200) });
  }

  function clearPanic() {
    if (!state.connected) return;
    send({ type: 'panic-clear' });
  }

  async function isGlobalPttCapable() {
    if (window.cadNative && window.cadNative.pttCapable) {
      try { return await window.cadNative.pttCapable(); } catch { return false; }
    }
    return false;
  }

  // ---------------- Propietario y roles ----------------
  function ownerSetup(password) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'owner-setup', password });
  }

  function ownerLogin(password) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'owner-login', password });
  }

  function ownerLogout() {
    if (!state.connected) return;
    send({ type: 'owner-logout' });
  }

  function assignRole(name, role) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'role-assign', name, role });
  }

  function restoreRoles(assignments) {
    if (!state.connected) return;
    send({ type: 'roles-restore', assignments });
  }

  // ---------------- Crear / gestionar canales ----------------
  function createChannel({ name, department, private: isPrivate, members, category }) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'channel-create', name, department: department || null, private: !!isPrivate, members: members || [], category: category || null });
  }

  function deleteChannel(name) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'channel-delete', channel: name });
  }

  function inviteToChannel(name, members) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'channel-invite', channel: name, members });
  }

  // ---------------- API pública ----------------
  window.Radio = {
    state,
    setEventHandler: (fn) => { state.onEvent = fn; },
    connect,
    disconnect,
    joinChannel,
    leaveChannel,
    createChannel,
    deleteChannel,
    inviteToChannel,
    ownerSetup,
    ownerLogin,
    ownerLogout,
    assignRole,
    restoreRoles,
    pttDown,
    pttUp,
    requestRelay: (reason) => requestRelay(reason || 'Activado manualmente.'),
    enableRelay: (reason) => enableRelay(reason || 'Activado manualmente.'),
    setSettings,
    setVolume,
    setMicDevice,
    setOutputDevice,
    sendChat,
    sendPanic,
    clearPanic,
    isGlobalPttCapable,
    DEFAULT_CHANNELS,
  };
})();
