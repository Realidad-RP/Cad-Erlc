// Bot de Discord que enlaza el CAD con el servidor de RP de ER:LC.
//
//   CAD (tu app)   --POST /cad/snapshot-->  Bot  --embeds-->  Discord
//   ER:LC (juego)  --webhooks----------->   Bot  --embeds-->  Discord
//   ER:LC (API)    <--consultas/órdenes--   Bot  <--comandos--  Discord
//
// Comandos en Discord:
//   /estado     → estado del servidor de ER:LC (jugadores, clave, verificación)
//   /jugadores  → lista de conectados agrupados por equipo
//   /cad        → resumen del despacho (llamadas abiertas, unidades, BOLOs)
//   /dni        → buscar una persona en los registros del CAD por su DNI
//   /juego      → ejecutar un comando dentro del juego (solo administradores)
//
// Guía completa: bot/README.md

const {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const { createCadMirror, buildCadSummary, buildDniReply } = require('./lib/cad');
const { createBotServer } = require('./lib/server');
const { getServerStatus, getPlayers, runCommand } = require('./lib/erlc');

// ============================================================
// 1. Configuración (bot/config.js o variables de entorno)
// ============================================================

function loadConfig() {
  let file = {};
  try { file = require('./config.js'); } catch {}

  // Los textos de ejemplo de config.example.js cuentan como "sin configurar".
  const USELESS = /^(PEGA-ACA|ID-DEL|inventa-una-clave)/i;
  const clean = (v) => (typeof v === 'string' && v.trim() && !USELESS.test(v.trim()) ? v.trim() : '');

  const pick = (envName, fileValue) => {
    const env = process.env[envName];
    return clean(env !== undefined && env !== '' ? env : (fileValue !== undefined ? fileValue : ''));
  };

  const channels = file.channels || {};
  return {
    discordToken: pick('DISCORD_TOKEN', file.discordToken || ''),
    guildId: pick('DISCORD_GUILD_ID', file.guildId || ''),
    erlcServerKey: pick('ERLC_SERVER_KEY', file.erlcServerKey || ''),
    cadKey: pick('CAD_KEY', file.cadKey || ''),
    port: parseInt(pick('PORT', file.port || 8790), 10) || 8790,
    pollSeconds: Math.max(30, parseInt(pick('POLL_SECONDS', file.pollSeconds || 60), 10) || 60),
    erlcWebhookPublicKey: file.erlcWebhookPublicKey, // solo para pruebas (undefined = clave oficial)
    channels: {
      despacho: pick('CH_DESPACHO', channels.despacho || ''),
      bolo: pick('CH_BOLO', channels.bolo || ''),
      erlc: pick('CH_ERLC', channels.erlc || ''),
      estado: pick('CH_ESTADO', channels.estado || ''),
    },
  };
}

const cfg = loadConfig();

// ============================================================
// 2. Estado interno
// ============================================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const mirror = createCadMirror();

let statusMessageId = null;   // mensaje de estado que se edita solo (canal estado)
let lastCommandAt = 0;        // control del límite de 1 comando cada ~5 s de la API
let discordReady = false;

// ============================================================
// 3. Publicación en Discord
// ============================================================

async function sendEmbed(channelId, { color, title, lines }, tag = '[BOT]') {
  const description = (lines || []).join('\n').slice(0, 3900);
  if (!channelId) {
    console.log(`${tag} (sin canal configurado) ${title} — ${description.replace(/\n/g, ' | ')}`);
    return;
  }
  if (!discordReady) {
    console.log(`${tag} Discord aún no está listo; se omite: ${title}`);
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId);
    const embed = new EmbedBuilder()
      .setColor(color || 0x3b82f6)
      .setTitle(String(title).slice(0, 250))
      .setDescription(description || null)
      .setFooter({ text: '🛡️ CAD La Realidad RP' })
      .setThumbnail('https://realidad-rp.github.io/Cad-Erlc/assets/logo.png')
      .setTimestamp(new Date());
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn(`${tag} No se pudo publicar en Discord:`, err.message);
  }
}

// ============================================================
// 4. Enlace con el CAD
// ============================================================

async function onCadSnapshot(snapshot) {
  const { announcements, firstSync } = mirror.update(snapshot);
  if (firstSync) {
    console.log('[CAD] Primera sincronización recibida (no se anuncia nada todavía).');
    return 0;
  }
  for (const a of announcements) {
    await sendEmbed(cfg.channels[a.channel], a, '[CAD]');
  }
  if (announcements.length) {
    console.log(`[CAD] ${announcements.length} novedad(es) publicadas.`);
  }
  return announcements.length;
}

// ============================================================
// 5. Webhooks del juego (ER:LC)
// ============================================================

const EVENT_FIELDS = [
  ['Player', '👤 Jugador'],
  ['Players', '👥 Jugadores'],
  ['Team', '🛡️ Equipo'],
  ['Callsign', '📻 Indicativo'],
  ['Vehicle', '🚗 Vehículo'],
  ['Plate', '🔢 Placa'],
  ['Location', '📍 Ubicación'],
  ['Command', '⌨️ Comando'],
  ['Message', '💬 Mensaje'],
  ['Details', '📝 Detalles'],
  ['Call', '🚨 Llamada'],
  ['Description', '📄 Descripción'],
  ['Type', '🏷️ Tipo'],
];

function buildEventEmbed(data) {
  const msg = String(data.Command || data.Message || '').trim();
  const embed = new EmbedBuilder()
    .setColor(msg.startsWith(';') ? 0x5865f2 : 0xed4245)
    .setTitle(msg.startsWith(';') ? '⌨️ Comando en el juego' : '🚨 Aviso de ER:LC')
    .setFooter({ text: '🛡️ CAD La Realidad RP · aviso automático de ER:LC' })
    .setTimestamp(new Date());

  const fields = [];
  for (const [key, label] of EVENT_FIELDS) {
    const v = data[key];
    if (v === undefined || v === null || typeof v === 'object') continue;
    const text = String(v);
    fields.push({ name: label, value: text.slice(0, 1000), inline: text.length <= 40 });
    if (fields.length >= 8) break;
  }

  if (fields.length) embed.addFields(fields);
  else embed.setDescription('```json\n' + JSON.stringify(data).slice(0, 1000) + '\n```');

  return embed;
}

async function onErlcEvent(data) {
  const embed = buildEventEmbed(data || {});
  if (!cfg.channels.erlc || !discordReady) {
    console.log(`[ERLC] Evento recibido: ${embed.data.title}`);
    return;
  }
  try {
    const channel = await client.channels.fetch(cfg.channels.erlc);
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn('[ERLC] No se pudo publicar el evento:', err.message);
  }
}

// ============================================================
// 6. Estado en vivo del juego (sondeo periódico + canal de estado)
// ============================================================

function statusEmbed(d) {
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`🎮 ${d.Name || 'Servidor ER:LC'}`)
    .setFooter({ text: '🛡️ CAD La Realidad RP · estado en vivo' })
    .setTimestamp(new Date())
    .addFields({ name: 'Jugadores', value: `**${d.CurrentPlayers ?? '?'} / ${d.MaxPlayers ?? '?'}**`, inline: true });

  if (d.JoinKey) embed.addFields({ name: 'Clave de ingreso', value: `\`${d.JoinKey}\``, inline: true });
  if (d.AccVerifiedReq) embed.addFields({ name: 'Verificación', value: String(d.AccVerifiedReq), inline: true });
  if (typeof d.TeamBalance === 'boolean') {
    embed.addFields({ name: 'Balance de equipos', value: d.TeamBalance ? 'Activado' : 'Desactivado', inline: true });
  }
  return embed;
}

async function updateStatusMessage(d) {
  if (!cfg.channels.estado || !discordReady) return;
  try {
    const channel = await client.channels.fetch(cfg.channels.estado);
    if (statusMessageId) {
      try {
        const msg = await channel.messages.fetch(statusMessageId);
        await msg.edit({ embeds: [statusEmbed(d)] });
        return;
      } catch {
        statusMessageId = null; // el mensaje fue borrado: creamos uno nuevo
      }
    }
    const sent = await channel.send({ embeds: [statusEmbed(d)] });
    statusMessageId = sent.id;
  } catch (err) {
    console.warn('[ERLC] No se pudo actualizar el canal de estado:', err.message);
  }
}

// Un ciclo de sondeo. Devuelve cuántos segundos esperar hasta el próximo.
async function pollOnce() {
  const r = await getServerStatus(cfg.erlcServerKey);
  if (!r.ok) {
    if (r.status === 429) {
      const wait = r.retryAfter || 60;
      console.warn(`[ERLC] Límite alcanzado; espero ${wait} s (lo pide la API).`);
      return wait;
    }
    console.warn(`[ERLC] Estado del juego: HTTP ${r.status}${r.data && r.data.message ? ' — ' + r.data.message : ''}`);
    return cfg.pollSeconds;
  }

  const d = r.data || {};
  client.user.setActivity(`${d.CurrentPlayers ?? '?'}/${d.MaxPlayers ?? '?'} jugadores`, { type: ActivityType.Watching });
  await updateStatusMessage(d);
  return cfg.pollSeconds;
}

function startPolling() {
  if (!cfg.erlcServerKey) {
    console.log('[ERLC] Sin server-key: se omite el estado en vivo (igual funcionan el CAD y los webhooks).');
    return;
  }
  const loop = async () => {
    let wait = cfg.pollSeconds;
    try { wait = (await pollOnce()) || cfg.pollSeconds; } catch (err) {
      console.warn('[ERLC] Error consultando la API:', err.message);
    }
    setTimeout(loop, Math.max(30, wait) * 1000);
  };
  loop();
}

// ============================================================
// 7. Comandos de barra (/estado /jugadores /cad /juego)
// ============================================================

const commands = [
  new SlashCommandBuilder().setName('estado').setDescription('Estado del servidor de ER:LC (jugadores, clave, verificación)').toJSON(),
  new SlashCommandBuilder().setName('jugadores').setDescription('Jugadores conectados al juego, por equipo').toJSON(),
  new SlashCommandBuilder().setName('cad').setDescription('Resumen del despacho: llamadas abiertas, unidades y BOLOs').toJSON(),
  new SlashCommandBuilder()
    .setName('dni')
    .setDescription('Buscar una persona en los registros del CAD por su DNI')
    .addStringOption((o) =>
      o.setName('numero').setDescription('DNI del personaje (ej. 30123456)').setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('juego')
    .setDescription('Ejecutar un comando dentro del juego (solo administradores)')
    .addStringOption((o) =>
      o.setName('comando').setDescription('Tal cual, con dos puntos: ej. ":h Buenos días"').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

async function registerCommands(c) {
  const rest = new REST({ version: '10' }).setToken(cfg.discordToken);
  if (cfg.guildId) {
    await rest.put(Routes.applicationGuildCommands(c.user.id, cfg.guildId), { body: commands });
  } else {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
  }
}

function fmtStatusReply(d) {
  const lines = [`**${d.Name || 'Servidor ER:LC'}**`];
  lines.push(`🎮 Jugadores: **${d.CurrentPlayers ?? '?'} / ${d.MaxPlayers ?? '?'}**`);
  if (d.JoinKey) lines.push(`🔑 Clave de ingreso: \`${d.JoinKey}\``);
  if (d.AccVerifiedReq) lines.push(`🔒 Verificación: ${d.AccVerifiedReq}`);
  if (typeof d.TeamBalance === 'boolean') lines.push(`⚖️ Balance de equipos: ${d.TeamBalance ? 'activado' : 'desactivado'}`);
  return lines.join('\n');
}

function fmtPlayersReply(list) {
  const byTeam = new Map();
  for (const p of list) {
    const name = String(p.Player || '').split(':')[0] || '¿?';
    const team = p.Team || 'Sin equipo';
    const label = p.Callsign ? `${name} (${p.Callsign})` : name;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(label);
  }
  const lines = [`👥 **${list.length} jugador(es) conectados**`];
  for (const [team, names] of [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`**${team} (${names.length}):** ${names.join(', ')}`);
  }
  return lines.join('\n').slice(0, 1900);
}

async function handleCommand(interaction) {
  const name = interaction.commandName;

  if (name === 'estado') {
    if (!cfg.erlcServerKey) return interaction.reply('⚠️ El bot no tiene configurada la server-key de ER:LC (ERLC_SERVER_KEY).');
    await interaction.deferReply();
    const r = await getServerStatus(cfg.erlcServerKey);
    if (!r.ok) return interaction.editReply(`⚠️ La API respondió HTTP ${r.status}${r.data && r.data.message ? ' — ' + r.data.message : ''}`);
    return interaction.editReply(fmtStatusReply(r.data || {}));
  }

  if (name === 'jugadores') {
    if (!cfg.erlcServerKey) return interaction.reply('⚠️ El bot no tiene configurada la server-key de ER:LC (ERLC_SERVER_KEY).');
    await interaction.deferReply();
    const r = await getPlayers(cfg.erlcServerKey);
    if (!r.ok) return interaction.editReply(`⚠️ La API respondió HTTP ${r.status}${r.data && r.data.message ? ' — ' + r.data.message : ''}`);
    const list = Array.isArray(r.data) ? r.data : [];
    if (!list.length) return interaction.editReply('🎮 El servidor está vacío: no hay jugadores conectados.');
    return interaction.editReply(fmtPlayersReply(list));
  }

  if (name === 'cad') {
    const summary = buildCadSummary(mirror.get());
    if (!summary) {
      return interaction.reply(
        '📡 El CAD todavía no envió datos.\nEn la app: panel **"Enlace con el bot"** → dirección `http://localhost:8790` (o la IP donde corra el bot) → la misma clave del bot → **Guardar y probar**.'
      );
    }
    return interaction.reply(summary);
  }

  if (name === 'dni') {
    const snapshot = mirror.get();
    if (!snapshot) {
      return interaction.reply(
        '📡 El CAD todavía no envió datos.\nEn la app: panel **"Enlace con el bot"** → dirección `http://localhost:8790` (o la IP donde corra el bot) → la misma clave del bot → **Guardar y probar**.'
      );
    }
    const numero = interaction.options.getString('numero', true);
    const reply = buildDniReply(snapshot, numero);
    if (!reply) {
      return interaction.reply(`❌ No hay ninguna persona con el DNI **${numero}** en los registros del CAD.`);
    }
    const embed = new EmbedBuilder()
      .setColor(reply.color)
      .setTitle(reply.title)
      .setDescription(reply.lines.join('\n').slice(0, 3900))
      .setFooter({ text: 'CAD · registros' })
      .setTimestamp(new Date());
    return interaction.reply({ embeds: [embed] });
  }

  if (name === 'juego') {
    if (!cfg.erlcServerKey) return interaction.reply({ content: '⚠️ El bot no tiene configurada la server-key de ER:LC.', flags: MessageFlags.Ephemeral });
    const since = Date.now() - lastCommandAt;
    if (since < 5000) {
      const wait = Math.ceil((5000 - since) / 1000);
      return interaction.reply({ content: `⏳ Esperá ${wait} s: la API permite un comando cada 5 segundos.`, flags: MessageFlags.Ephemeral });
    }
    const comando = interaction.options.getString('comando', true).trim();
    lastCommandAt = Date.now();
    await interaction.deferReply();
    const r = await runCommand(cfg.erlcServerKey, comando);
    const apiMsg = (r.data && r.data.message) || '';
    if (r.ok) {
      return interaction.editReply(`✅ Ejecutado: \`${comando}\`${apiMsg && !/success/i.test(apiMsg) ? `\nℹ️ ${apiMsg}` : ''}`);
    }
    return interaction.editReply(`⚠️ No se pudo ejecutar (HTTP ${r.status})${apiMsg ? ` — ${apiMsg}` : ''}`);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction);
  } catch (err) {
    console.error('[BOT] Error atendiendo el comando:', err);
    const fallback = { content: '⚠️ Ocurrió un error inesperado. Probá de nuevo.', flags: MessageFlags.Ephemeral };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(fallback.content);
      else await interaction.reply(fallback);
    } catch {}
  }
});

client.on(Events.ClientReady, async (c) => {
  discordReady = true;
  console.log(`[Bot] Conectado como ${c.user.tag} · ${c.guilds.cache.size} servidor(es) de Discord`);
  try {
    await registerCommands(c);
    console.log('[Bot] Comandos listos: /estado /jugadores /cad /dni /juego');
  } catch (err) {
    console.warn('[Bot] No se pudieron registrar los comandos:', err.message);
  }

  const base = process.env.RENDER_EXTERNAL_URL;
  if (base) {
    console.log('[Bot] Webhook del juego (pegalo en ER:LC → Settings → Event Webhook):');
    console.log(`      ${base}/erlc/webhook`);
  }

  startPolling();
});

// ============================================================
// 8. Arranque
// ============================================================

(async () => {
  try {
    const server = await createBotServer({ cfg, onCadSnapshot, onErlcEvent });
    console.log(`[Bot] Servidor HTTP activo en el puerto ${server.port} (salud: /health)`);
    console.log(`[Bot] El CAD debe apuntar a: http://localhost:${server.port}  (clave: ${cfg.cadKey ? 'configurada ✅' : 'FALTA ⚠️'})`);
    if (!cfg.channels.despacho && !cfg.channels.bolo && !cfg.channels.erlc) {
      console.log('[Bot] Aviso: no hay canales configurados; los avisos se muestran solo acá en consola.');
    }
  } catch (err) {
    console.error('[Bot] No se pudo iniciar el servidor HTTP:', err.message);
    process.exit(1);
  }

  if (!cfg.discordToken) {
    console.log('[Bot] Falta el token de Discord. Completá bot/config.js (o la variable DISCORD_TOKEN) y reiniciá.');
    console.log('[Bot] Mientras tanto, el enlace con el CAD sigue activo.');
    return;
  }

  try {
    await client.login(cfg.discordToken);
  } catch (err) {
    console.error('[Bot] No se pudo conectar a Discord:', err.message);
    console.error('[Bot] Revisá que el token sea correcto y que el bot esté invitado a tu servidor.');
  }
})();
