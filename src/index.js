import { Client, GatewayIntentBits, Collection, Events, ActivityType } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { initDatabase, stmts, db } from './database.js';
import { handleButtonInteraction } from './interactions/buttons.js';
import { handlePrefix, isPrefix } from './prefix.js';
import { buildCollectionEmbed } from './embeds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable in Dev Portal
  ],
});

client.commands = new Collection();

// Load commands
for (const file of readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(__dirname, 'commands', file)));
  client.commands.set(mod.default.data.name, mod.default);
}

client.once(Events.ClientReady, () => {
  initDatabase();
  console.log(`[WikiRoll] Ready as ${client.user.tag}`);
  client.user.setPresence({
    status: 'online',
    activities: [{
      name: 'wikiroll.hackatoa.com',
      type: ActivityType.Watching,
    }],
  });
});

client.on(Events.MessageCreate, async message => {
  if (isPrefix(message.content)) await handlePrefix(message);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
    } else if (interaction.isButton()) {
      // Collection pagination handled inline here
      if (interaction.customId.startsWith('col_')) {
        await handleCollectionPage(interaction);
      } else {
        await handleButtonInteraction(interaction);
      }
    }
  } catch (err) {
    console.error('[WikiRoll] Interaction error:', err);
    const payload = { content: '❌ Something went wrong.', ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch {}
  }
});

async function handleCollectionPage(interaction) {
  const [, targetId, pageStr] = interaction.customId.split('_');
  const page = parseInt(pageStr);
  if (page < 1) return interaction.deferUpdate();

  const target = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!target) return interaction.deferUpdate();

  const chars      = stmts.getUserCollection.all(interaction.guildId, targetId);
  const perPage    = 12;
  const totalPages = Math.max(1, Math.ceil(chars.length / perPage));
  const safePage   = Math.min(page, totalPages);

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const embed = buildCollectionEmbed(target, chars, safePage);
  const rows  = [];

  if (totalPages > 1) {
    const ar = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`col_${targetId}_${safePage - 1}`)
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 1),
      new ButtonBuilder()
        .setCustomId(`col_${targetId}_${safePage + 1}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages)
    );
    rows.push(ar);
  }

  await interaction.update({ embeds: [embed], components: rows });
}

client.login(process.env.BOT_TOKEN);

// Stats HTTP server — used by wikiroll-api.hackatoa.com
createServer((req, res) => {
  if (req.url === '/stats' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const totalChars = db.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
    const totalUsers = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM ownership').get().n;
    res.end(JSON.stringify({
      guilds: client.guilds.cache.size,
      characters: totalChars,
      users: totalUsers,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3015);
