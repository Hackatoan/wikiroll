import { Client, GatewayIntentBits, Collection, Events, ActivityType } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { initDatabase, stmts, getLinkedGuildIds, getUserCollectionCrossGuild } from './database.js';
import { handleButtonInteraction, handleSelectInteraction } from './interactions/buttons.js';
import { handlePrefix, isPrefix } from './prefix.js';
import { buildCollectionEmbed, sortCollection, collectionPageId } from './embeds.js';
import { startWebhookServer } from './webhooks.js';
import { startStatsPoster } from './stats-poster.js';
import { refreshWikiWeights } from './wiki.js';

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
  startWebhookServer(client, 3015);
  startStatsPoster(client);
  console.log(`[WikiRoll] Ready as ${client.user.tag}`);
  // Background: cache each wiki's size so the roll pool can be size-weighted.
  // Fire-and-forget; throttled internally, refreshes ~monthly.
  refreshWikiWeights(stmts.getAllSourceUrls.all().map(r => r.wiki_url))
    .catch(e => console.error('[wiki] weight refresh failed:', e.message));
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
    } else if (interaction.isAutocomplete()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith('col_')) {
        await handleCollectionPage(interaction);
      } else {
        await handleButtonInteraction(interaction);
      }
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectInteraction(interaction);
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
  const [, targetId, pageStr, sort = 'n'] = interaction.customId.split('_');
  const page = parseInt(pageStr);
  if (page < 1) return interaction.deferUpdate();

  const target = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!target) return interaction.deferUpdate();

  const chars      = sortCollection(getUserCollectionCrossGuild(getLinkedGuildIds(interaction.guildId), targetId), sort);
  const perPage    = 12;
  const totalPages = Math.max(1, Math.ceil(chars.length / perPage));
  const safePage   = Math.min(page, totalPages);

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const embed = buildCollectionEmbed(target, chars, safePage);
  const rows  = [];

  if (totalPages > 1) {
    const ar = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(collectionPageId(targetId, safePage - 1, sort))
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 1),
      new ButtonBuilder()
        .setCustomId(collectionPageId(targetId, safePage + 1, sort))
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages)
    );
    rows.push(ar);
  }

  await interaction.update({ embeds: [embed], components: rows });
}

client.login(process.env.BOT_TOKEN);
