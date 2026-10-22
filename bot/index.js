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
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const { createCadMirror, buildCadSummary, buildDniReply } = require('./lib/cad');
const { createBotServer } = require('./lib/server');
const { createWebAuth } = require('./lib/web-auth');
const { createDiscordStore } = require('./lib/store');
const { getServerStatus, getPlayers, runCommand } = require('./lib/erlc');

// ============================================================
// 1. Configuración (bot/config.js o variables de entorno)
// ============================================================

// IDs del servidor de La Realidad RP. Se pueden pisar con variables de
// entorno si algún día cambian los roles.
const LICENSE_ROLE_DEFAULTS = {
  lapd: '1553781631695720488',
  central: '1553786287121498244',
  min: '1553779127436181534',
};

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
      panel: pick('CH_PANEL', channels.panel || ''), // datos privados de la web
      licencias: pick('CH_LICENCIAS', channels.licencias || ''), // solicitudes de licencia
    },
    licenseCategory: clean(process.env.CH_LICENCIAS_CATEGORIA || file.licenseCategory || '') || 'Realidad RP Bot',
    // Rol extra que también puede revisar (compatibilidad con CH_LICENCIAS_ROL).
    licenseRoleId: pick('CH_LICENCIAS_ROL', file.licenseRoleId || ''),
    // LAPD y Central solo ven el canal; desde licenseMinRoleId hacia arriba revisan.
    licenseLapdRoleId: pick('CH_LICENCIAS_LAPD', file.licenseLapdRoleId || '') || LICENSE_ROLE_DEFAULTS.lapd,
    licenseCentralRoleId: pick('CH_LICENCIAS_CENTRAL', file.licenseCentralRoleId || '') || LICENSE_ROLE_DEFAULTS.central,
    licenseMinRoleId: pick('CH_LICENCIAS_DESDE', file.licenseMinRoleId || '') || LICENSE_ROLE_DEFAULTS.min,
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
let discordLoginError = '';   // se muestra en /web/status si Discord no conecta
let cadUpdatedAt = 0;         // última vez que el CAD envió su estado
let licenseChannelId = null;  // canal privado #solicitudes-licencia

// ============================================================
// 2b. Cuentas de la web (Panel de Ciudadano)
// ============================================================

// Busca al usuario de Discord por su nombre dentro del servidor.
// Usa la búsqueda de miembros por REST: en el Developer Portal hay
// que activar "SERVER MEMBERS INTENT" (Bot → Privileged Gateway Intents).
async function resolveDiscordUser(query) {
  if (!discordReady) return null;
  const q = String(query || '').trim().replace(/^@+/, '');
  if (!q) return null;

  let guild = null;
  try {
    if (cfg.guildId) {
      guild = client.guilds.cache.get(cfg.guildId)
        || await client.guilds.fetch(cfg.guildId).catch(() => null);
      if (!guild && client.guilds.cache.size === 1) {
        console.warn('[Web] No encontré el servidor configurado; uso el único servidor del bot.');
        guild = client.guilds.cache.first();
      }
    } else {
      guild = client.guilds.cache.first() || null;
    }
  } catch (err) {
    console.warn('[Web] No pude abrir el servidor de Discord:', err.message);
    return null;
  }
  if (!guild) return null;

  let members = [];
  try {
    if (typeof guild.members.search === 'function') {
      const found = await guild.members.search({ query: q, limit: 10 });
      members = Array.from(found.values());
    }
  } catch (err) {
    console.warn('[Web] Búsqueda de miembros:', err.message);
    console.warn('[Web] Activá "SERVER MEMBERS INTENT" en Discord Developer Portal → Bot.');
  }
  if (!members.length) members = Array.from(guild.members.cache.values());

  const lower = q.toLowerCase();
  const member =
    members.find((m) => m.user.username.toLowerCase() === lower) ||
    members.find((m) => String(m.user.globalName || '').toLowerCase() === lower) ||
    members.find((m) => String(m.displayName || '').toLowerCase() === lower) ||
    members.find((m) => m.user.username.toLowerCase().includes(lower));

  if (!member) return null;
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName || member.user.globalName || member.user.username,
    avatar: member.user.displayAvatarURL({ size: 128, extension: 'png' }),
  };
}

async function sendDiscordDM(discordId, content) {
  if (!discordReady) throw new Error('El bot de Discord todavía no está conectado.');
  if (!discordId) throw new Error('Ese usuario no tiene ID de Discord.');
  const user = await client.users.fetch(String(discordId));
  await user.send(content);
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

// Busca el usuario de Roblox para guardar también su ID y nombre visible.
// Si Roblox no responde, no bloqueamos el registro: se guarda el nombre
// escrito y se puede completar después.
async function resolveRobloxUser(username) {
  const name = String(username || '').trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let res;
    try {
      res = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ usernames: [name], excludeBannedUsers: true }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.warn(`[Web] Roblox respondió HTTP ${res.status}; guardo el nombre sin verificar.`);
      return { id: '', username: name, displayName: name };
    }
    const data = await res.json();
    const user = Array.isArray(data && data.data) ? data.data[0] : null;
    if (!user) return null;
    return {
      id: user.id,
      username: cleanText(user.name || name, 20),
      displayName: cleanText(user.displayName || user.name || name, 60),
    };
  } catch (err) {
    console.warn('[Web] No pude consultar Roblox:', err.message);
    return { id: '', username: name, displayName: name };
  }
}

function channelName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

async function getGuild() {
  if (!discordReady) return null;
  try {
    let guild = null;
    if (cfg.guildId) {
      guild = client.guilds.cache.get(cfg.guildId) || await client.guilds.fetch(cfg.guildId).catch(() => null);
      if (!guild && client.guilds.cache.size === 1) guild = client.guilds.cache.first();
    } else {
      guild = client.guilds.cache.first() || null;
    }
    return guild || null;
  } catch {
    return null;
  }
}

function findRoleByIdOrName(guild, roleId, namePattern) {
  if (!guild) return null;
  if (roleId) {
    const byId = guild.roles.cache.get(String(roleId));
    if (byId) return byId;
  }
  if (namePattern) {
    return guild.roles.cache.find((role) =>
      role.id !== guild.id &&
      !role.managed &&
      namePattern.test(role.name)
    ) || null;
  }
  return null;
}

function findLicenseRole(guild) {
  if (!guild) return null;
  const configured = findRoleByIdOrName(guild, cfg.licenseRoleId, null);
  if (configured) return configured;
  const byName = guild.roles.cache.find((role) =>
    role.id !== guild.id &&
    !role.managed &&
    /^(moderador|moderadora|moderaci[oó]n|staff|administrador|administraci[oó]n|admin)/i.test(role.name)
  );
  if (byName) return byName;
  return guild.roles.cache.find((role) =>
    role.id !== guild.id &&
    !role.managed &&
    role.permissions.has(PermissionFlagsBits.ManageGuild)
  ) || null;
}

function getLicenseRoleSets(guild) {
  if (!guild) return { viewers: [], reviewers: [] };

  const lapd = findRoleByIdOrName(guild, cfg.licenseLapdRoleId, /\blapd\b|los angeles police/i);
  const central = findRoleByIdOrName(guild, cfg.licenseCentralRoleId, /\bcentral\b/i);
  const minRole = findRoleByIdOrName(guild, cfg.licenseMinRoleId, /moderador(?:a)?\s+en\s+prueba/i);
  const configuredReviewer = findRoleByIdOrName(guild, cfg.licenseRoleId, null);

  const reviewers = new Map();
  const addReviewer = (role) => {
    if (role && role.id !== guild.id && !role.managed) reviewers.set(role.id, role);
  };

  if (minRole) {
    for (const role of guild.roles.cache.values()) {
      if (role.id !== guild.id && !role.managed && role.position >= minRole.position) {
        addReviewer(role);
      }
    }
  }
  addReviewer(configuredReviewer);

  // Si no encontramos el rol de referencia, mantenemos el comportamiento
  // anterior: buscar Moderador/Staff/Administrador o un rol con ManageGuild.
  if (!reviewers.size) addReviewer(findLicenseRole(guild));

  const viewers = new Map();
  const addViewer = (role) => {
    if (role && role.id !== guild.id) viewers.set(role.id, role);
  };
  addViewer(lapd);
  addViewer(central);
  for (const role of reviewers.values()) addViewer(role);

  return { viewers: [...viewers.values()], reviewers: [...reviewers.values()] };
}

function licenseChannelIsPrivate(channel, guild) {
  const everyoneId = guild.roles.everyone.id;
  const deniedView = (overwrite) => {
    if (!overwrite || !overwrite.deny) return false;
    if (typeof overwrite.deny.has === 'function') {
      return overwrite.deny.has(PermissionFlagsBits.ViewChannel);
    }
    return (BigInt(overwrite.deny.bitfield || 0) & PermissionFlagsBits.ViewChannel) ===
      PermissionFlagsBits.ViewChannel;
  };
  const cache = channel.permissionOverwrites && channel.permissionOverwrites.cache;
  if (!cache) return false;
  const own = cache.get(everyoneId);
  if (own) return deniedView(own);
  const parent = channel.parent;
  const parentCache = parent && parent.permissionOverwrites && parent.permissionOverwrites.cache;
  return parentCache ? deniedView(parentCache.get(everyoneId)) : false;
}

function buildLicenseOverwrites(guild, roleSets) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  // Los revisores mandan sobre los que solo pueden ver.
  const access = new Map();
  for (const role of roleSets.viewers) access.set(role.id, 'view');
  for (const role of roleSets.reviewers) access.set(role.id, 'review');

  const botTop = guild.members.me && guild.members.me.roles
    ? guild.members.me.roles.highest.position
    : Infinity;
  for (const [id, level] of access) {
    const role = guild.roles.cache.get(id);
    if (!role || role.position >= botTop) continue;
    overwrites.push({
      id,
      allow: level === 'review'
        ? [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
          ]
        : [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
      ...(level === 'review' ? {} : {
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.SendMessagesInThreads,
          PermissionFlagsBits.CreatePrivateThreads,
        ],
      }),
    });
  }
  return overwrites;
}

async function ensureLicenseChannel() {
  if (!discordReady) return null;
  const guild = await getGuild();
  if (!guild) {
    console.warn('[Licencias] No encontré el servidor de Discord; no puedo crear el canal.');
    return null;
  }

  let channel = null;
  if (cfg.channels.licencias) {
    const configured = await client.channels.fetch(cfg.channels.licencias).catch(() => null);
    if (configured && configured.type === ChannelType.GuildText) {
      channel = configured;
    } else {
      console.warn('[Licencias] El ID de CH_LICENCIAS no existe o no es un canal de texto; busco o creo #solicitudes-licencia.');
    }
  }

  if (!channel) {
    channel = guild.channels.cache.find((ch) =>
      ch.type === ChannelType.GuildText && channelName(ch.name) === 'solicitudes-licencia'
    ) || null;
  }

  let category = guild.channels.cache.find((ch) =>
    ch.type === ChannelType.GuildCategory && channelName(ch.name) === channelName(cfg.licenseCategory)
  ) || guild.channels.cache.find((ch) =>
    ch.type === ChannelType.GuildCategory &&
    channelName(ch.name).includes('realidad') &&
    channelName(ch.name).includes('bot')
  ) || null;

  if (!category) {
    try {
      category = await guild.channels.create({
        name: cfg.licenseCategory,
        type: ChannelType.GuildCategory,
        reason: 'Sección para los canales privados del bot',
      });
      console.log(`[Licencias] Categoría creada: ${category.name}`);
    } catch (err) {
      console.warn('[Licencias] No pude crear la categoría "' + cfg.licenseCategory + '":', err.message);
    }
  }

  const roleSets = getLicenseRoleSets(guild);
  const overwrites = buildLicenseOverwrites(guild, roleSets);
  const accessText = `${roleSets.viewers.length} rol(es) con acceso, ${roleSets.reviewers.length} revisor(es)`;
  const canManageRoles = !!(guild.members.me && guild.members.me.permissions &&
    guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles));

  if (channel) {
    if (category && channel.parentId !== category.id) {
      try {
        await channel.setParent(category.id, { lockPermissions: false });
      } catch (err) {
        console.warn('[Licencias] No pude mover #solicitudes-licencia a la categoría:', err.message);
      }
    }
    if (canManageRoles) {
      try {
        await channel.permissionOverwrites.set(overwrites);
      } catch (err) {
        console.warn('[Licencias] No pude aplicar los permisos del canal (revisá Gestionar canales/roles y la jerarquía):', err.message);
      }
    }
    if (!licenseChannelIsPrivate(channel, guild)) {
      console.warn(
        '[Licencias] El canal #' + channel.name + ' no es privado. ' +
        'El bot necesita Gestionar canales/roles para ocultarlo; no lo uso para licencias.'
      );
      return null;
    }
    licenseChannelId = channel.id;
    console.log(
      `[Licencias] Reutilizo #${channel.name}` +
      (category ? ` en ${category.name}` : '') +
      ` · ${accessText}`
    );
    return channel;
  }

  try {
    const options = {
      name: 'solicitudes-licencia',
      type: ChannelType.GuildText,
      topic: 'Solicitudes de licencia del Panel de Ciudadano · LAPD, Central y staff',
      permissionOverwrites: overwrites,
      reason: 'Canal privado para revisar las licencias solicitadas desde el panel',
    };
    if (category) options.parent = category.id;
    channel = await guild.channels.create(options);
    if (!licenseChannelIsPrivate(channel, guild)) {
      console.warn('[Licencias] El canal se creó pero no quedó privado; no lo uso para licencias.');
      return null;
    }
    licenseChannelId = channel.id;
    console.log(
      `[Licencias] Canal creado: #${channel.name}` +
      (category ? ` en ${category.name}` : '') +
      ` · ${accessText}`
    );
    return channel;
  } catch (err) {
    console.warn('[Licencias] No pude crear #solicitudes-licencia (revisá Gestionar canales):', err.message);
    channel = guild.channels.cache.find((ch) =>
      ch.type === ChannelType.GuildText && channelName(ch.name) === 'solicitudes-licencia'
    ) || null;
    if (channel) {
      licenseChannelId = channel.id;
      return channel;
    }
    return null;
  }
}

function licenseField(name, value, inline = true) {
  return {
    name,
    value: String(value == null || value === '' ? '—' : value).slice(0, 1024),
    inline,
  };
}

function buildLicenseEmbed(application, review = null) {
  const app = application || {};
  const embed = new EmbedBuilder()
    .setFooter({ text: 'Panel de Ciudadano · Licencias' })
    .setTimestamp(new Date(review ? (review.license && review.license.reviewedAt) || Date.now() : app.submittedAt || Date.now()));

  if (!review) {
    embed
      .setColor(0xf0b429)
      .setTitle('📝 Nueva solicitud de licencia')
      .setDescription(`**${app.name || 'Ciudadano'}** (\`${app.dni || 'sin DNI'}\`) solicitó una licencia desde el panel.`)
      .addFields(
        licenseField('Discord', app.username ? '@' + app.username : '—'),
        licenseField('Roblox', app.robloxUsername || '—'),
        licenseField('Experiencia', app.experience || '—'),
        licenseField('Vehículo', app.vehicleType || '—'),
        licenseField('Normas de tránsito', app.trafficRules || '—'),
        licenseField('Motivo', app.reason || '—', false)
      );
    return embed;
  }

  const license = review.license || {};
  const approved = review.decision === 'approved';
  embed
    .setColor(approved ? 0x35d07f : 0xf2545b)
    .setTitle(approved ? '✅ Licencia aprobada' : '❌ Solicitud rechazada')
    .setDescription(`**${app.name || 'Ciudadano'}** (\`${app.dni || 'sin DNI'}\`)`)
    .addFields(
      licenseField('Discord', app.username ? '@' + app.username : '—'),
      licenseField('Roblox', app.robloxUsername || '—'),
      licenseField('Estado', license.label || (approved ? 'Válida' : 'Rechazada')),
      licenseField('Número', approved ? (license.number || '—') : '—'),
      licenseField('Vence', approved ? new Date(license.expiresAt || Date.now()).toLocaleDateString('es-AR') : '—'),
      licenseField('Revisado por', license.reviewedBy || '—'),
      licenseField('Respuesta', approved ? 'Licencia emitida.' : (license.rejectionReason || 'Rechazada por el staff.'), false)
    );
  return embed;
}

async function sendLicenseApplication(application) {
  if (!discordReady) throw new Error('El bot de Discord todavía no está conectado.');
  let channel = licenseChannelId
    ? await client.channels.fetch(licenseChannelId).catch(() => null)
    : null;
  if (!channel) channel = await ensureLicenseChannel();
  if (!channel) {
    throw new Error('No hay canal de licencias. Revisá que el bot pueda gestionar canales en Discord.');
  }
  const msg = await channel.send({
    embeds: [buildLicenseEmbed(application)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lic:approve:' + application.username)
          .setLabel('Aprobar y emitir')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('lic:reject:' + application.username)
          .setLabel('Rechazar')
          .setStyle(ButtonStyle.Danger)
      ),
    ],
    allowedMentions: { parse: [] },
  });
  return { id: msg.id };
}

function buildWeaponLicenseEmbed(application, review = null) {
  const app = application || {};
  const embed = new EmbedBuilder()
    .setFooter({ text: 'Panel de Ciudadano · Licencia de armas' })
    .setTimestamp(new Date(review ? (review.license && review.license.reviewedAt) || Date.now() : app.submittedAt || Date.now()));

  if (!review) {
    embed
      .setColor(0xe67e22)
      .setTitle('🔫 Nueva solicitud de licencia de armas')
      .setDescription(`**${app.name || 'Ciudadano'}** (\`${app.dni || 'sin DNI'}\`) solicitó una licencia de armas desde el panel.`)
      .addFields(
        licenseField('Discord', app.username ? '@' + app.username : '—'),
        licenseField('Roblox', app.robloxUsername || '—'),
        licenseField('Experiencia con armas', app.experience || '—'),
        licenseField('Tipo de licencia', app.weaponType || '—'),
        licenseField('Uso previsto', app.purpose || '—'),
        licenseField('Motivo', app.reason || '—', false)
      );
    return embed;
  }

  const license = review.license || {};
  const approved = review.decision === 'approved';
  embed
    .setColor(approved ? 0x35d07f : 0xf2545b)
    .setTitle(approved ? '✅ Licencia de armas aprobada' : '❌ Licencia de armas rechazada')
    .setDescription(`**${app.name || 'Ciudadano'}** (\`${app.dni || 'sin DNI'}\`)`)
    .addFields(
      licenseField('Discord', app.username ? '@' + app.username : '—'),
      licenseField('Roblox', app.robloxUsername || '—'),
      licenseField('Tipo de licencia', app.weaponType || '—'),
      licenseField('Estado', license.label || (approved ? 'Válida' : 'Rechazada')),
      licenseField('Número', approved ? (license.number || '—') : '—'),
      licenseField('Vence', approved ? new Date(license.expiresAt || Date.now()).toLocaleDateString('es-AR') : '—'),
      licenseField('Revisado por', license.reviewedBy || '—'),
      licenseField('Respuesta', approved ? 'Licencia de armas emitida.' : (license.rejectionReason || 'Rechazada por el staff.'), false)
    );
  return embed;
}

async function sendWeaponLicenseApplication(application) {
  if (!discordReady) throw new Error('El bot de Discord todavía no está conectado.');
  let channel = licenseChannelId
    ? await client.channels.fetch(licenseChannelId).catch(() => null)
    : null;
  if (!channel) channel = await ensureLicenseChannel();
  if (!channel) {
    throw new Error('No hay canal de licencias. Revisá que el bot pueda gestionar canales en Discord.');
  }
  const msg = await channel.send({
    embeds: [buildWeaponLicenseEmbed(application)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('licw:approve:' + application.username)
          .setLabel('Aprobar licencia de armas')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('licw:reject:' + application.username)
          .setLabel('Rechazar')
          .setStyle(ButtonStyle.Danger)
      ),
    ],
    allowedMentions: { parse: [] },
  });
  return { id: msg.id };
}

async function handleLicenseButton(interaction) {
  const [, action, ...rest] = String(interaction.customId || '').split(':');
  const username = rest.join(':');
  if (!action || !username) return;

  const guild = interaction.guild || await getGuild();
  const reviewerIds = new Set(getLicenseRoleSets(guild).reviewers.map((role) => role.id));
  const memberRoles = interaction.member && interaction.member.roles && interaction.member.roles.cache;
  const hasReviewerRole = !!(memberRoles && memberRoles.some((role) => reviewerIds.has(role.id)));
  const canReview = (interaction.memberPermissions &&
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) || hasReviewerRole;
  if (!canReview) {
    return interaction.reply({
      content: '⛔ Solo los rangos de moderación (desde Moderador en Prueba) pueden aprobar o rechazar licencias.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  try {
    const result = await webAuth.reviewLicense(
      username,
      action,
      {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.member && interaction.member.displayName
          ? interaction.member.displayName
          : interaction.user.globalName || interaction.user.username,
      },
      action === 'reject' ? 'Solicitud rechazada por el staff desde Discord.' : ''
    );

    await interaction.editReply({
      embeds: [buildLicenseEmbed(result.application, result)],
      components: [],
    });

    const dm = result.decision === 'approved'
      ? `✅ **La Realidad RP · Licencia aprobada**\n\nTu licencia fue aprobada.\nNúmero: **${result.license.number}**\nVence: **${new Date(result.license.expiresAt).toLocaleDateString('es-AR')}**\n\nYa podés verla en el Panel de Ciudadano.`
      : `❌ **La Realidad RP · Licencia rechazada**\n\n${result.license.rejectionReason || 'Solicitud rechazada por el staff.'}\n\nPodés volver a solicitar desde el Panel de Ciudadano.`;
    if (result.discordId) sendDiscordDM(result.discordId, dm).catch(() => {});
  } catch (err) {
    console.warn('[Licencias] No se pudo revisar la solicitud:', err.message);
    await interaction.followUp({
      content: '⚠️ ' + err.message,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

async function handleWeaponLicenseButton(interaction) {
  const [, action, ...rest] = String(interaction.customId || '').split(':');
  const username = rest.join(':');
  if (!action || !username) return;

  const guild = interaction.guild || await getGuild();
  const reviewerIds = new Set(getLicenseRoleSets(guild).reviewers.map((role) => role.id));
  const memberRoles = interaction.member && interaction.member.roles && interaction.member.roles.cache;
  const hasReviewerRole = !!(memberRoles && memberRoles.some((role) => reviewerIds.has(role.id)));
  const canReview = (interaction.memberPermissions &&
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) || hasReviewerRole;
  if (!canReview) {
    return interaction.reply({
      content: '⛔ Solo los rangos de moderación (desde Moderador en Prueba) pueden aprobar o rechazar licencias.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();
  try {
    const result = await webAuth.reviewWeaponLicense(
      username,
      action,
      {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.member && interaction.member.displayName
          ? interaction.member.displayName
          : interaction.user.globalName || interaction.user.username,
      },
      action === 'reject' ? 'Solicitud de licencia de armas rechazada por el staff desde Discord.' : ''
    );

    await interaction.editReply({
      embeds: [buildWeaponLicenseEmbed(result.application, result)],
      components: [],
    });

    const dm = result.decision === 'approved'
      ? `✅ **La Realidad RP · Licencia de armas aprobada**\n\nTu licencia de armas fue aprobada.\nNúmero: **${result.license.number}**\nVence: **${new Date(result.license.expiresAt).toLocaleDateString('es-AR')}**\n\nYa podés verla en el Panel de Ciudadano, en Registro Civil → Armas.`
      : `❌ **La Realidad RP · Licencia de armas rechazada**\n\n${result.license.rejectionReason || 'Solicitud rechazada por el staff.'}\n\nPodés volver a solicitar desde Registro Civil → Armas.`;
    if (result.discordId) sendDiscordDM(result.discordId, dm).catch(() => {});
  } catch (err) {
    console.warn('[Licencias] No se pudo revisar la solicitud de armas:', err.message);
    await interaction.followUp({
      content: '⚠️ ' + err.message,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

// Cuentas y reseñas: se guardan en un canal privado de Discord para que
// sobrevivan a los reinicios de Render (el disco gratuito es efímero).
const webStore = createDiscordStore({
  client,
  guildId: cfg.guildId,
  channelId: cfg.channels.panel,
  log: console.log,
});

const webAuth = createWebAuth({
  store: webStore,
  resolveDiscordUser,
  resolveRobloxUser,
  sendDiscordDM,
  sendLicenseApplication,
  sendWeaponLicenseApplication,
  isDiscordReady: () => discordReady,
  getDiscordError: () => discordLoginError,
  getCadSnapshot: () => mirror.get(),
  getCadUpdatedAt: () => cadUpdatedAt,
  cadKey: cfg.cadKey || '',
  log: console.log,
});

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
  cadUpdatedAt = Date.now();
  const { announcements, firstSync } = mirror.update(snapshot);
  if (firstSync) {
    const count = (value) => (Array.isArray(value) ? value.length : 0);
    console.log(
      '[CAD] Primera sincronización recibida (no se anuncia nada todavía): ' +
      `${count(snapshot.persons)} personas, ${count(snapshot.vehicles)} vehículos, ` +
      `${count(snapshot.fines)} multas, ${count(snapshot.warrants)} órdenes.`
    );
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
  if (interaction.isButton()) {
    const customId = String(interaction.customId || '');
    if (!customId.startsWith('lic:') && !customId.startsWith('licw:')) return;
    try {
      if (customId.startsWith('licw:')) await handleWeaponLicenseButton(interaction);
      else await handleLicenseButton(interaction);
    } catch (err) {
      console.error('[BOT] Error atendiendo el botón de licencia:', err);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: '⚠️ Ocurrió un error inesperado.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }
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
  discordLoginError = '';
  console.log(`[Bot] Conectado como ${c.user.tag} · ${c.guilds.cache.size} servidor(es) de Discord`);
  try {
    await registerCommands(c);
    console.log('[Bot] Comandos listos: /estado /jugadores /cad /dni /juego');
  } catch (err) {
    console.warn('[Bot] No se pudieron registrar los comandos:', err.message);
  }
  try {
    await ensureLicenseChannel();
  } catch (err) {
    console.warn('[Licencias] No se pudo preparar el canal:', err.message);
  }
  console.log('[Web] Registro/login con código por MD activo (revisá SERVER MEMBERS INTENT).');

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
    const server = await createBotServer({ cfg, onCadSnapshot, onErlcEvent, webAuth });
    console.log(`[Bot] Servidor HTTP activo en el puerto ${server.port} (salud: /health)`);
    console.log(`[Bot] El CAD debe apuntar a: http://localhost:${server.port}  (clave: ${cfg.cadKey ? 'configurada ✅' : 'FALTA ⚠️'})`);
    console.log(`[Web] Cuentas y reseñas listas · datos en ${webAuth.file}`);
    console.log(`[Web] La web debe apuntar a ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + server.port}`);
    if (!cfg.channels.despacho && !cfg.channels.bolo && !cfg.channels.erlc) {
      console.log('[Bot] Aviso: no hay canales configurados; los avisos se muestran solo acá en consola.');
    }
  } catch (err) {
    console.error('[Bot] No se pudo iniciar el servidor HTTP:', err.message);
    process.exit(1);
  }

  if (!cfg.discordToken) {
    discordLoginError = 'Falta DISCORD_TOKEN en las variables de entorno (o en bot/config.js).';
    console.log('[Bot] Falta el token de Discord. Completá bot/config.js (o la variable DISCORD_TOKEN) y reiniciá.');
    console.log('[Bot] Mientras tanto, el enlace con el CAD sigue activo.');
    return;
  }

  try {
    await client.login(cfg.discordToken);
  } catch (err) {
    discordLoginError = 'No se pudo conectar a Discord: ' + err.message;
    console.error('[Bot] No se pudo conectar a Discord:', err.message);
    console.error('[Bot] Revisá que el token sea correcto y que el bot esté invitado a tu servidor.');
  }
})();
