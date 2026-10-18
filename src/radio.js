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
    { name: 'Despacho Central',     department: null,       private: false },
    { name: 'Policía (LCPD)',       department: 'LCPD',     private: false },
    { name: 'Highway Patrol (CHP)', department: 'CHP',      private: false },
    { name: 'Bomberos/EMS (LCFD)',  department: 'LCFD',     private: false },
    { name: 'Transporte (DOT)',     department: 'DOT',      private: false },
    { name: 'Central 9-1-1',        department: 'DISPATCH', private: false },
    { name: 'Táctico 1',            department: null,       private: false },
    { name: 'Táctico 2',            department: null,       private: false },
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
    role: 'Miembro',
    serverUrl: '',
    channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
    channel: null,
    members: new Map(), // id -> { id, name, department, talking }
    userlist: [],       // todos los conectados al servidor (para invitar)
    peers: new Map(),   // id -> { pc, pendingCandidates, audio, initiated }
    iceServers: [...DEFAULT_ICE_SERVERS],
    localStream: null,
    pttActive: false,
    settings: { pttKey: 'V', pttMode: 'hold', volume: 1 },
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
  function connect(url, name, department, role) {
    return new Promise((resolve) => {
      disconnect(true); // por si había una conexión anterior
      state.serverUrl = url;
      state.name = name;
      state.department = department;
      state.role = role || 'Miembro';

      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        emit('error', 'Dirección de servidor inválida: ' + err.message);
        resolve(false);
        return;
      }
      state.ws = ws;

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
        send({ type: 'hello', name, department, role: state.role });
        emit('connected', { url });
        resolve(true);
      };

      ws.onmessage = (ev) => {
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
    closeAllPeers();
    if (!silent) emit('disconnected');
  }

  // ---------------- Mensajes del servidor ----------------
  function handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        state.myId = msg.id;
        if (Array.isArray(msg.channels) && msg.channels.length) state.channels = msg.channels;
        // El servidor puede enviar STUN/TURN configurados (para internet)
        if (Array.isArray(msg.iceServers) && msg.iceServers.length) {
          state.iceServers = msg.iceServers;
        }
        emit('channels', state.channels);
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
        emit('joined', msg.channel);
        emitRoster();
        // Al ser los recién llegados, NOSOTROS iniciamos la conexión con cada uno
        ensureMic().then((okMic) => {
          if (!okMic) return;
          for (const m of msg.members || []) {
            if (m.id !== state.myId) initiatePeer(m.id);
          }
        });
        break;
      }

      case 'peer-joined': {
        // Alguien nuevo entró: esperamos SU oferta (él inicia la conexión)
        if (msg.member) state.members.set(msg.member.id, msg.member);
        emitRoster();
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

      case 'kicked':
        // Nos sacaron del canal (por ejemplo, lo eliminó un supervisor)
        state.channel = null;
        closeAllPeers();
        state.members.clear();
        emitRoster();
        emit('kicked', msg.reason || 'Te sacaron del canal.');
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
    }
  }

  // ---------------- Micrófono ----------------
  async function ensureMic() {
    if (state.localStream) return true;
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // El micrófono arranca CERRADO; solo se abre al pulsar el PTT
      for (const t of state.localStream.getAudioTracks()) t.enabled = false;
      emit('mic', true);
      return true;
    } catch (err) {
      emit('error', 'No se pudo acceder al micrófono: ' + err.message);
      return false;
    }
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
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
      entry.audio = audio;
      const box = document.getElementById('audio-container');
      if (box) box.appendChild(audio);
    };

    pc.onconnectionstatechange = () => {
      emit('peer-state', { id, connectionState: pc.connectionState });
      if (pc.connectionState === 'failed') {
        try { pc.restartIce(); } catch {}
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
    send({ type: 'join', channel });
    return true;
  }

  function leaveChannel() {
    if (!state.channel) return;
    send({ type: 'leave' });
    closeAllPeers();
    state.channel = null;
    state.members.clear();
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
    for (const entry of state.peers.values()) {
      if (entry.audio) entry.audio.volume = v;
    }
  }

  function sendChat(text) {
    if (!state.channel) {
      emit('error', 'Entra a un canal para usar el chat de radio.');
      return;
    }
    send({ type: 'chat', text });
  }

  async function isGlobalPttCapable() {
    if (window.cadNative && window.cadNative.pttCapable) {
      try { return await window.cadNative.pttCapable(); } catch { return false; }
    }
    return false;
  }

  // ---------------- Crear / gestionar canales ----------------
  function createChannel({ name, department, private: isPrivate, members }) {
    if (!state.connected) { emit('error', 'Primero conéctate al servidor de radio.'); return; }
    send({ type: 'channel-create', name, department: department || null, private: !!isPrivate, members: members || [] });
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
    pttDown,
    pttUp,
    setSettings,
    setVolume,
    sendChat,
    isGlobalPttCapable,
    DEFAULT_CHANNELS,
  };
})();
