// ============================================================
// Almacenes de datos para el Panel de Ciudadano.
//
// - FileStore: guarda en bot/data/web.json (desarrollo o respaldo).
// - DiscordStore: guarda cada cuenta, sesión y reseña como un mensaje
//   en un canal privado de Discord. Así los datos sobreviven a los
//   reinicios y "spin-down" de Render sin pagar un disco persistente.
//
// Formato de cada mensaje:  LR1|{"k":"acc|ses|rev","d":{...}}
// ============================================================

const fs = require('fs');
const path = require('path');

const PREFIX = 'LR1|';
const CHANNEL_NAME = 'panel-ciudadano';
const MAX_MESSAGE = 1950;

function pack(kind, data) {
  const text = PREFIX + JSON.stringify({ k: kind, d: data });
  if (text.length > MAX_MESSAGE) throw new Error('El registro es demasiado largo para Discord.');
  return text;
}

function unpack(content) {
  if (typeof content !== 'string' || !content.startsWith(PREFIX)) return null;
  try {
    const obj = JSON.parse(content.slice(PREFIX.length));
    if (!obj || typeof obj !== 'object' || !obj.k || !obj.d) return null;
    return obj;
  } catch {
    return null;
  }
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

// ============================================================
// Almacén en archivo local
// ============================================================

function createFileStore(dir) {
  const root = dir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, 'web.json');

  let data = { accounts: {}, sessions: {}, reviews: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (raw && typeof raw === 'object') {
      data.accounts = raw.accounts && typeof raw.accounts === 'object' ? raw.accounts : {};
      data.sessions = raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {};
      data.reviews = Array.isArray(raw.reviews) ? raw.reviews : [];
    }
  } catch { /* primera vez */ }

  function flush() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, ...data }, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    kind: 'file',
    file,
    describe() { return file; },
    async load() {
      return {
        accounts: { ...data.accounts },
        sessions: { ...data.sessions },
        reviews: data.reviews.slice(),
      };
    },
    async putAccount(account) {
      data.accounts[normalizeUsername(account.username)] = account;
      flush();
    },
    async putSession(hash, session) {
      data.sessions[hash] = session;
      flush();
    },
    async deleteSession(hash) {
      delete data.sessions[hash];
      flush();
    },
    async putReview(review) {
      data.reviews.push(review);
      if (data.reviews.length > 1000) data.reviews = data.reviews.slice(-1000);
      flush();
    },
  };
}

// ============================================================
// Almacén en un canal privado de Discord
// ============================================================

function createDiscordStore({ client, guildId, channelId, log = console.log }) {
  let channel = null;
  let loading = null;
  const cache = { accounts: {}, sessions: {}, reviews: [] };
  const ids = { accounts: new Map(), sessions: new Map(), reviews: new Map() };

  async function getGuild() {
    if (!client || !client.user) throw new Error('El bot de Discord todavía no está conectado.');
    if (guildId) {
      const configured = client.guilds.cache.get(guildId)
        || await client.guilds.fetch(guildId).catch(() => null);
      if (configured) return configured;
      if (client.guilds.cache.size === 1) {
        log('[Web] No encontré el servidor configurado; uso el único servidor del bot.');
        return client.guilds.cache.first();
      }
      throw new Error('No encontré el servidor de Discord configurado (revisá DISCORD_GUILD_ID).');
    }
    return client.guilds.cache.first() || null;
  }

  async function getChannel() {
    if (channel) return channel;
    const guild = await getGuild();
    if (!guild) throw new Error('El bot no está en ningún servidor de Discord.');

    let found = null;
    if (channelId) {
      try { found = await client.channels.fetch(channelId); } catch { found = null; }
    }
    if (!found) {
      try { await guild.channels.fetch(); } catch { /* usamos la caché */ }
      found = guild.channels.cache.find((c) => c && c.name === CHANNEL_NAME && c.isTextBased && c.isTextBased()) || null;
    }
    if (!found) {
      const { ChannelType, PermissionFlagsBits } = require('discord.js');
      const create = (allow) => guild.channels.create({
        name: CHANNEL_NAME,
        type: ChannelType.GuildText,
        topic: '🔒 Datos privados del Panel de Ciudadano · no borrar ni renombrar',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow },
        ],
      });
      try {
        found = await create([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ]);
      } catch (err) {
        // Algunos bots no pueden delegar todos esos permisos. Lo importante
        // es que el canal sea privado y que el bot pueda verlo; el resto se
        // hereda de sus roles. No pedimos ManageMessages: así funciona incluso
        // si el bot no puede borrar mensajes viejos.
        log('[Web] No pude crear el panel con todos los permisos; reintento con lo mínimo:', err.message);
        found = await create([PermissionFlagsBits.ViewChannel]);
      }
      log(`[Web] Canal privado creado: #${CHANNEL_NAME} (no lo borres).`);
    }
    channel = found;
    return channel;
  }

  async function fetchAll(ch) {
    const out = [];
    let before = null;
    // 60 páginas = 6000 mensajes. Las sesiones vencidas se borran al cargar,
    // así que en una comunidad normal esto sobra. Si algún día se llega al
    // límite, se avisa en el log para no perder cuentas viejas en silencio.
    for (let page = 0; page < 60; page++) {
      const batch = await ch.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      out.push(...batch.values());
      before = batch.last().id;
      if (batch.size < 100) break;
      if (page === 59) log('[Web] El canal del panel tiene más de 6000 mensajes; conviene limpiar sesiones viejas.');
    }
    return out.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  }

  function applyMessage(msg) {
    const obj = unpack(msg.content);
    if (!obj) return;
    const d = obj.d || {};
    if (obj.k === 'acc' && d.username) {
      const key = normalizeUsername(d.username);
      cache.accounts[key] = d;
      ids.accounts.set(key, msg.id);
    } else if (obj.k === 'ses' && d.h) {
      cache.sessions[d.h] = {
        username: d.username,
        expires: d.expires,
        createdAt: d.createdAt,
      };
      ids.sessions.set(d.h, msg.id);
    } else if (obj.k === 'rev' && d.id) {
      if (!cache.reviews.some((r) => r.id === d.id)) cache.reviews.push(d);
      ids.reviews.set(d.id, msg.id);
    }
  }

  async function put(kind, key, data, map, prevId) {
    const ch = await getChannel();
    const content = pack(kind, data);
    if (prevId) {
      try {
        const msg = await ch.messages.fetch(prevId);
        await msg.edit(content);
        map.set(key, msg.id);
        return;
      } catch { /* mensaje borrado: enviamos uno nuevo */ }
    }
    const sent = await ch.send(content);
    map.set(key, sent.id);
  }

  return {
    kind: 'discord',
    describe() { return channel ? `Discord #${channel.name}` : 'Discord (canal privado)'; },
    async load() {
      if (!loading) {
        loading = (async () => {
          const ch = await getChannel();
          const messages = await fetchAll(ch);
          // Resetear el índice (por si se llama más de una vez)
          for (const k of Object.keys(cache.accounts)) delete cache.accounts[k];
          for (const k of Object.keys(cache.sessions)) delete cache.sessions[k];
          cache.reviews.length = 0;
          ids.accounts.clear();
          ids.sessions.clear();
          ids.reviews.clear();
          for (const msg of messages) applyMessage(msg);
          return {
            accounts: { ...cache.accounts },
            sessions: { ...cache.sessions },
            reviews: cache.reviews.slice(),
          };
        })().catch((err) => {
          loading = null;
          throw err;
        });
      }
      return loading;
    },
    async putAccount(account) {
      const key = normalizeUsername(account.username);
      await put('acc', key, account, ids.accounts, ids.accounts.get(key));
      cache.accounts[key] = account;
    },
    async putSession(hash, session) {
      await put('ses', hash, { h: hash, ...session }, ids.sessions, ids.sessions.get(hash));
      cache.sessions[hash] = session;
    },
    async deleteSession(hash) {
      const id = ids.sessions.get(hash);
      delete cache.sessions[hash];
      ids.sessions.delete(hash);
      if (!id) return;
      try {
        const ch = await getChannel();
        const msg = await ch.messages.fetch(id);
        await msg.delete();
      } catch { /* ya no existe */ }
    },
    async putReview(review) {
      await put('rev', review.id, review, ids.reviews, ids.reviews.get(review.id));
      if (!cache.reviews.some((r) => r.id === review.id)) cache.reviews.push(review);
    },
  };
}

module.exports = { createFileStore, createDiscordStore };
