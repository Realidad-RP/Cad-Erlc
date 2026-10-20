// Prueba del almacén en un canal de Discord (sin conectarse a Discord).
// Ejecutar: node bot/test-discord-store.js

const { createDiscordStore } = require('./lib/store');

let seq = 0;
let clock = 1700000000000;

function makeChannel(name) {
  const messages = new Map();
  const channel = {
    id: 'ch-' + name,
    name,
    isTextBased: () => true,
    messages: {
      async fetch(arg) {
        if (typeof arg === 'string') {
          const m = messages.get(arg);
          if (!m) throw new Error('Unknown Message');
          return m;
        }
        const limit = (arg && arg.limit) || 50;
        let list = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        if (arg && arg.before) list = list.filter((m) => Number(m.id.split('-')[1]) < Number(String(arg.before).split('-')[1]));
        const take = list.slice(0, limit);
        const out = new Map(take.map((m) => [m.id, m]));
        out.last = () => take[take.length - 1];
        return out;
      }
    },
    async send(content) {
      seq++;
      const id = 'm-' + seq;
      const msg = {
        id,
        content,
        createdTimestamp: clock++,
        async edit(next) { this.content = next; return this; },
        async delete() { messages.delete(this.id); }
      };
      messages.set(id, msg);
      return msg;
    }
  };
  return { channel, messages };
}

const { channel, messages } = makeChannel('panel-ciudadano');
const everyone = { id: 'everyone' };
const channelCache = new Map([[channel.id, channel]]);
channelCache.find = (fn) => [...channelCache.values()].find(fn) || null;
const guild = {
  id: 'g1',
  name: 'La Realidad RP',
  roles: { everyone },
  channels: {
    cache: channelCache,
    async fetch() { return channel; },
    async create(opts) {
      if (opts.name !== 'panel-ciudadano') throw new Error('nombre inesperado');
      return channel;
    }
  }
};
const client = {
  user: { id: 'bot', username: 'bot' },
  guilds: {
    cache: new Map([[guild.id, guild]]),
    async fetch() { return guild; }
  },
  channels: {
    async fetch() { return channel; }
  }
};

const checks = {};
function check(name, ok) {
  checks[name] = !!ok;
  console.log((ok ? '✅' : '❌') + ' ' + name);
}

(async () => {
  const store1 = createDiscordStore({ client, guildId: 'g1', log: () => {} });
  const empty = await store1.load();
  check('canal privado cargado', store1.describe().includes('#panel-ciudadano'));
  check('arranca vacío', Object.keys(empty.accounts).length === 0 && empty.reviews.length === 0);

  const account = {
    username: 'ana',
    displayName: 'Ana RP',
    avatar: 'https://cdn.discordapp.com/avatars/1/ana.png',
    discordId: '1',
    salt: 'abc',
    hash: 'f'.repeat(128),
    role: 'Ciudadano',
    createdAt: clock
  };
  await store1.putAccount(account);
  await store1.putSession('hash1', { username: 'ana', expires: clock + 86400000, createdAt: clock });
  await store1.putReview({ id: 'r1', nombre: 'Ana RP', estrellas: 5, texto: 'Muy bueno', fecha: clock, avatar: account.avatar });

  check('la cuenta se guarda como mensaje', [...messages.values()].some((m) => m.content.startsWith('LR1|') && m.content.includes('"acc"')));

  // Simular reinicio: otra instancia que lee los mismos mensajes.
  const store2 = createDiscordStore({ client, guildId: 'g1', log: () => {} });
  const restored = await store2.load();
  check('la cuenta sobrevive al reinicio', restored.accounts.ana && restored.accounts.ana.displayName === 'Ana RP');
  check('la sesión sobrevive al reinicio', !!restored.sessions.hash1);
  check('la reseña sobrevive al reinicio', restored.reviews.length === 1 && restored.reviews[0].id === 'r1');

  // Actualizar la cuenta debe editar el mensaje, no crear otro.
  const countBefore = messages.size;
  await store2.putAccount({ ...account, displayName: 'Ana Actualizada' });
  check('actualizar una cuenta no duplica mensajes', messages.size === countBefore);

  const store3 = createDiscordStore({ client, guildId: 'g1', log: () => {} });
  const afterEdit = await store3.load();
  check('la edición se lee después del reinicio', afterEdit.accounts.ana.displayName === 'Ana Actualizada');

  // Cerrar sesión debe borrar su mensaje.
  await store3.deleteSession('hash1');
  const store4 = createDiscordStore({ client, guildId: 'g1', log: () => {} });
  const afterDelete = await store4.load();
  check('cerrar sesión borra el registro', !afterDelete.sessions.hash1);

  // Los mensajes ajenos se ignoran.
  await channel.send('mensaje normal del staff');
  const store5 = createDiscordStore({ client, guildId: 'g1', log: () => {} });
  const afterJunk = await store5.load();
  check('ignora mensajes que no son del panel', !afterJunk.accounts['mensaje normal'] && afterJunk.reviews.length === 1);

  // Si el canal no existe, se crea privado y con permisos para el bot.
  const fresh = makeChannel('panel-ciudadano');
  let createdOpts = null;
  const cache2 = new Map();
  cache2.find = () => null;
  const guild2 = {
    id: 'g2',
    roles: { everyone: { id: 'everyone-2' } },
    channels: {
      cache: cache2,
      async fetch() { return cache2; },
      async create(opts) {
        createdOpts = opts;
        cache2.set(fresh.channel.id, fresh.channel);
        return fresh.channel;
      }
    }
  };
  const client2 = {
    user: { id: 'bot-2', username: 'bot' },
    guilds: { cache: new Map([['g2', guild2]]), async fetch() { return guild2; } },
    channels: { async fetch() { throw new Error('sin ID'); } }
  };
  const storeNew = createDiscordStore({ client: client2, guildId: 'g2', log: () => {} });
  await storeNew.load();
  check('crea el canal privado si no existe', createdOpts && createdOpts.name === 'panel-ciudadano');
  const overwrites = (createdOpts && createdOpts.permissionOverwrites) || [];
  const denyAll = overwrites.find((o) => o.id === 'everyone-2');
  const allowBot = overwrites.find((o) => o.id === 'bot-2');
  check('oculta el canal para @everyone', !!denyAll && Array.isArray(denyAll.deny) && denyAll.deny.length > 0);
  check('le da acceso al bot', !!allowBot && Array.isArray(allowBot.allow) && allowBot.allow.length > 0);

  const total = Object.keys(checks).length;
  const ok = Object.values(checks).filter(Boolean).length;
  console.log(`\nDISCORD STORE ${ok === total ? 'OK' : 'FALLO'} (${ok}/${total})`);
  process.exit(ok === total ? 0 : 1);
})().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
