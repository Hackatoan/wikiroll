/**
 * Prefix command handler for `w.` commands
 * Mirrors slash commands but via chat messages.
 */
import { db, stmts, getCharsByIds, getSettings } from './database.js';
import { fetchTenCharacters, searchWikipedia, fetchWikiPage } from './wiki.js';
import {
  buildRollEmbeds, buildClaimButtons, buildCollectionEmbed,
  buildSearchEmbed, buildCharInfoEmbed, buildWishlistEmbed,
  buildSettingsEmbed,
} from './embeds.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

const PREFIX = 'w.';

export function isPrefix(content) {
  return content.toLowerCase().startsWith(PREFIX);
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function handlePrefix(message) {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();
  if (!content.toLowerCase().startsWith(PREFIX)) return;

  const withoutPrefix = content.slice(PREFIX.length).trim();
  const [cmd, ...argParts] = withoutPrefix.split(/\s+/);
  const args = argParts;
  const cmdLower = cmd.toLowerCase();

  const guildId = message.guild.id;
  const userId  = message.author.id;

  try {
    switch (cmdLower) {
      case 'roll':       return await prefixRoll(message, guildId, userId);
      case 'daily':      return await prefixDaily(message, guildId, userId);
      case 'c':
      case 'collection': return await prefixCollection(message, args, guildId);
      case 'search':
      case 's':          return await prefixSearch(message, args.join(' '), guildId);
      case 'info':       return await prefixInfo(message, args.join(' '), guildId);
      case 'trade':      return await prefixTrade(message, args, guildId, userId);
      case 'remove':
      case 'divorce':    return await prefixRemove(message, args.join(' '), guildId, userId);
      case 'wl':
      case 'wishlist':   return await prefixWishlist(message, args, guildId, userId);
      case 'about':      return await prefixAbout(message);
      case 'help':       return await prefixHelp(message);
      default:           return; // ignore unknown
    }
  } catch (e) {
    console.error('[prefix] error:', e.message);
    message.reply('❌ Something went wrong.').catch(() => {});
  }
}

// ── Roll ──────────────────────────────────────────────────────────────────

async function prefixRoll(message, guildId, userId) {
  const now      = Math.floor(Date.now() / 1000);
  const settings = getSettings(guildId);
  const cooldownSecs = settings.roll_cooldown_minutes * 60;

  const cd = stmts.getCooldown.get(userId, guildId);
  if (cd) {
    const remaining = cooldownSecs - (now - cd.last_roll);
    if (remaining > 0) {
      const mins = Math.ceil(remaining / 60);
      return message.reply(`⏳ You can roll again in **${mins} minute${mins !== 1 ? 's' : ''}**.`);
    }
  }

  const rolling = await message.reply('🎲 Rolling...');

  const guildSources  = stmts.getSources.all(guildId).map(s => s.wiki_url);
  const wishedChars   = stmts.getGuildWishChars.all(guildId);
  const wishedSources = stmts.getGuildWishSources.all(guildId);

  const rawChars = await fetchTenCharacters({ guildSources, wishedChars, wishedSources });
  if (!rawChars.length) {
    return rolling.edit('❌ Failed to fetch characters. Try again in a moment.');
  }

  const chars = [];
  for (const raw of rawChars) {
    try {
      if (raw.id) {
        chars.push(raw);
      } else {
        const row = stmts.upsertChar.get(raw);
        chars.push({ ...raw, id: row.id });
      }
    } catch {}
  }

  const claimWindowSecs = settings.claim_window_minutes * 60;
  const expiresAt = now + claimWindowSecs;

  const roll = stmts.createRoll.run({
    guild_id: guildId,
    channel_id: message.channel.id,
    user_id: userId,
    message_id: null,
    character_ids: JSON.stringify(chars.map(c => c.id)),
    expires_at: expiresAt,
  });
  const rollId = roll.lastInsertRowid;

  stmts.setCooldown.run(userId, guildId);

  const embeds     = buildRollEmbeds(chars);
  const components = buildClaimButtons(rollId, chars.length);
  const mins = settings.claim_window_minutes;

  const msg = await rolling.edit({
    content: `🎲 **${message.author.username}** rolled! Claim within **${mins} minute${mins !== 1 ? 's' : ''}**!`,
    embeds,
    components,
  });

  stmts.setRollMessageId.run(msg.id, rollId);

  setTimeout(async () => {
    try { await msg.edit({ content: `🎲 ~~${message.author.username}'s roll~~ *(expired)*`, embeds, components: [] }); } catch {}
  }, claimWindowSecs * 1000);
}

// ── Daily ─────────────────────────────────────────────────────────────────

async function prefixDaily(message, guildId, userId) {
  const now      = Math.floor(Date.now() / 1000);
  const settings = getSettings(guildId);
  const today    = todayUTC();

  if (settings.roll_channel && message.channel.id !== settings.roll_channel) {
    return message.reply(`🗓️ Daily rolls are restricted to <#${settings.roll_channel}>.`);
  }

  const dailyRec = stmts.getDaily.get(userId, guildId);

  if (dailyRec?.last_daily === today) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    const secsLeft = Math.ceil(tomorrow.getTime() / 1000 - now);
    const h = Math.floor(secsLeft / 3600);
    const m = Math.ceil((secsLeft % 3600) / 60);
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return message.reply(`⏳ Already rolled today. Next daily in **${timeStr}**.`);
  }

  const streak = dailyRec?.last_daily === yesterdayUTC()
    ? Math.min(dailyRec.streak + 1, 100)
    : 1;

  const claims = Math.min(streak >= 2 ? 2 : 1, 2);

  stmts.setDaily.run(userId, guildId, today, streak);

  const rolling = await message.reply('🗓️ Rolling your daily...');

  const guildSources  = stmts.getSources.all(guildId).map(s => s.wiki_url);
  const wishedChars   = stmts.getGuildWishChars.all(guildId);
  const wishedSources = stmts.getGuildWishSources.all(guildId);
  const rawChars = await fetchTenCharacters({ guildSources, wishedChars, wishedSources });

  const chars = [];
  for (const raw of rawChars) {
    try {
      const row = raw.id ? raw : stmts.upsertChar.get(raw);
      chars.push({ ...raw, id: row.id });
    } catch (e) {
      console.error('daily upsert error', e.message);
    }
  }

  const claimWindowSecs = settings.claim_window_minutes * 60;
  const expiresAt = now + claimWindowSecs;

  const roll = stmts.createDailyRoll.run({
    guild_id: guildId,
    channel_id: message.channel.id,
    user_id: userId,
    message_id: null,
    character_ids: JSON.stringify(chars.map(c => c.id)),
    expires_at: expiresAt,
    daily_claims: claims,
  });
  const rollId = roll.lastInsertRowid;

  const embeds     = buildRollEmbeds(chars);
  const components = buildClaimButtons(rollId, chars.length);
  const mins       = settings.claim_window_minutes;

  const streakLine = streak >= 2
    ? `🔥 **${streak}-day streak** — you get **${claims} claims** from this roll!\n`
    : '';

  const msg = await rolling.edit({
    content: `🗓️ **${message.author.username}'s daily roll!**\n${streakLine}Claim within **${mins} minute${mins !== 1 ? 's' : ''}**!`,
    embeds,
    components,
  });

  stmts.setRollMessageId.run(msg.id, rollId);

  setTimeout(async () => {
    try {
      await msg.edit({
        content: `🗓️ ~~${message.author.username}'s daily roll~~ *(expired)*`,
        embeds,
        components: [],
      });
    } catch {}
  }, claimWindowSecs * 1000);
}

// ── Collection ────────────────────────────────────────────────────────────

async function prefixCollection(message, args, guildId) {
  // w.collection [@user] [page]
  const mention = message.mentions.users.first();
  const target  = mention ?? message.author;
  const page    = parseInt(args.find(a => /^\d+$/.test(a))) || 1;

  const chars      = stmts.getUserCollection.all(guildId, target.id);
  const totalPages = Math.max(1, Math.ceil(chars.length / 12));
  const safePage   = Math.min(page, totalPages);
  const embed      = buildCollectionEmbed(target, chars, safePage);

  const rows = [];
  if (totalPages > 1) {
    const ar = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`col_${target.id}_${safePage - 1}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 1),
      new ButtonBuilder().setCustomId(`col_${target.id}_${safePage + 1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages)
    );
    rows.push(ar);
  }
  await message.reply({ embeds: [embed], components: rows });
}

// ── Search ────────────────────────────────────────────────────────────────

async function prefixSearch(message, query, guildId) {
  if (!query) return message.reply('Usage: `w.search <name>`');
  const placeholder = await message.reply('🔍 Searching...');

  let results = stmts.searchChars.all(guildId, `%${query}%`);
  if (results.length < 3) {
    const titles = await searchWikipedia(query);
    for (const title of titles) {
      if (results.some(r => r.name.toLowerCase() === title.toLowerCase())) continue;
      const char = await fetchWikiPage(title);
      if (!char) continue;
      try {
        const row = stmts.upsertChar.get(char);
        const owner = stmts.getOwner.get(guildId, row.id);
        results.push({ ...char, id: row.id, owner_id: owner?.user_id ?? null });
      } catch {}
    }
  }
  await placeholder.edit({ content: '', embeds: [buildSearchEmbed(results, query)] });
}

// ── Info ──────────────────────────────────────────────────────────────────

async function prefixInfo(message, name, guildId) {
  if (!name) return message.reply('Usage: `w.info <name>`');
  const results = stmts.searchChars.all(guildId, `%${name}%`);
  if (!results.length) return message.reply(`No character matching **"${name}"** found.`);
  const char  = results[0];
  const owner = stmts.getOwner.get(guildId, char.id);
  await message.reply({ embeds: [buildCharInfoEmbed(char, owner?.user_id ?? null)] });
}

// ── Trade ─────────────────────────────────────────────────────────────────

async function prefixTrade(message, args, guildId, userId) {
  // w.trade @user <offer> <want>
  const target = message.mentions.users.first();
  if (!target) return message.reply('Usage: `w.trade @user <your char> <their char>`');

  const nonMentionArgs = args.filter(a => !a.startsWith('<@'));
  if (nonMentionArgs.length < 2) return message.reply('Usage: `w.trade @user <your char> <their char>`');

  const offerQ   = nonMentionArgs[0];
  const requestQ = nonMentionArgs.slice(1).join(' ');

  if (target.id === userId)  return message.reply('You cannot trade with yourself.');
  if (target.bot)            return message.reply('You cannot trade with a bot.');

  const myChars    = stmts.searchChars.all(guildId, `%${offerQ}%`).filter(c => c.owner_id === userId);
  if (!myChars.length) return message.reply(`You don't own a character matching **"${offerQ}"**.`);

  const theirChars = stmts.searchChars.all(guildId, `%${requestQ}%`).filter(c => c.owner_id === target.id);
  if (!theirChars.length) return message.reply(`<@${target.id}> doesn't own a character matching **"${requestQ}"**.`);

  const offerChar   = myChars[0];
  const requestChar = theirChars[0];

  const now       = Math.floor(Date.now() / 1000);
  const expiresAt = now + 600;

  const trade = stmts.createTrade.run({
    guild_id: guildId, initiator_id: userId, target_id: target.id,
    initiator_char_id: offerChar.id, target_char_id: requestChar.id,
    message_id: null, expires_at: expiresAt,
  });
  const tradeId = trade.lastInsertRowid;

  const { buildTradeEmbed } = await import('./embeds.js');
  const embed = buildTradeEmbed(message.author.username, target.username, offerChar, requestChar);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${tradeId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`trade_decline_${tradeId}`).setLabel('Decline').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );

  const msg = await message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
  stmts.setTradeMessageId.run(msg.id, tradeId);

  setTimeout(async () => {
    try { await msg.edit({ content: '⏰ Trade offer expired.', embeds: [], components: [] }); } catch {}
  }, 600_000);
}

// ── Remove ────────────────────────────────────────────────────────────────

async function prefixRemove(message, name, guildId, userId) {
  if (!name) return message.reply('Usage: `w.remove <name>`');
  const results = stmts.searchChars.all(guildId, `%${name}%`);
  const owned   = results.filter(c => c.owner_id === userId);
  if (!owned.length) return message.reply(`You don't own any character matching **"${name}"**.`);
  if (owned.length > 1) {
    return message.reply(`Multiple matches:\n${owned.slice(0,5).map((c,i)=>`${i+1}. ${c.name}`).join('\n')}\nBe more specific.`);
  }
  stmts.removeChar.run(guildId, userId, owned[0].id);
  await message.reply(`💔 **${owned[0].name}** removed from your collection.`);
}

// ── Wishlist ──────────────────────────────────────────────────────────────

async function prefixWishlist(message, args, guildId, userId) {
  const sub  = (args[0] ?? 'view').toLowerCase();
  const rest = args.slice(1).join(' ');

  if (sub === 'view' || !args.length) {
    const items = stmts.getUserWishlist.all(userId, guildId);
    return message.reply({ embeds: [buildWishlistEmbed(message.author, items)] });
  }

  if (sub === 'add') {
    if (!rest) return message.reply('Usage: `w.wl add <name>`');
    const local = stmts.searchChars.all(guildId, `%${rest}%`);
    let charId = null, charName = rest;
    if (local.length) { charId = local[0].id; charName = local[0].name; }
    else {
      const titles = await searchWikipedia(rest);
      if (titles.length) {
        const char = await fetchWikiPage(titles[0]);
        if (char) { const row = stmts.upsertChar.get(char); charId = row.id; charName = char.name; }
      }
    }
    if (!charId) return message.reply(`Character **"${rest}"** not found.`);
    stmts.addWish.run(userId, guildId, charId, charName);
    return message.reply(`⭐ Added **${charName}** to your wishlist!`);
  }

  if (sub === 'remove' || sub === 'rm') {
    const local = stmts.searchChars.all(guildId, `%${rest}%`);
    if (!local.length) return message.reply(`**"${rest}"** not found.`);
    stmts.removeWish.run(userId, guildId, local[0].id);
    return message.reply(`Removed **${local[0].name}** from your wishlist.`);
  }

  if (sub === 'addsource' || sub === 'as') {
    if (!rest) return message.reply('Usage: `w.wl addsource <fandom_url_or_keyword>`');
    const isUrl = rest.includes('.fandom.com') || rest.startsWith('http');
    let sourceType, sourceValue, displayName;
    if (isUrl) {
      try {
        const parsed = new URL(rest.startsWith('http') ? rest : `https://${rest}`);
        sourceType = 'fandom'; sourceValue = `${parsed.protocol}//${parsed.hostname}`; displayName = parsed.hostname;
      } catch { return message.reply('Invalid URL.'); }
    } else {
      sourceType = 'search'; sourceValue = rest; displayName = rest;
    }
    stmts.addWishSource.run(userId, guildId, sourceType, sourceValue, displayName);
    return message.reply(`✅ \`${displayName}\` added as a boosted source (3× roll weight)!`);
  }

  if (sub === 'sources' || sub === 'src') {
    const sources = stmts.getUserWishSources.all(userId, guildId);
    if (!sources.length) return message.reply('No boosted sources yet. Use `w.wl addsource <url_or_keyword>`');
    const lines = sources.map(s => `• **${s.display_name ?? s.source_value}** *(${s.source_type})*`);
    return message.reply(`**Your boosted sources:**\n${lines.join('\n')}`);
  }
}

// ── Help ──────────────────────────────────────────────────────────────────

async function prefixAbout(message) {
  const guildId = message.guild.id;
  const totalChars   = db.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
  const guildOwned   = db.prepare('SELECT COUNT(*) AS n FROM ownership WHERE guild_id = ?').get(guildId).n;
  const guildRollers = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM ownership WHERE guild_id = ?').get(guildId).n;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('WikiRoll')
    .setDescription('Collect characters and articles from **Wikipedia + 70+ Fandom wikis**.\nRoll, claim, trade, and build your collection — one wiki page at a time.')
    .addFields(
      {
        name: '📊 Stats',
        value: [
          `**${totalChars.toLocaleString()}** characters in the global pool`,
          `**${guildOwned.toLocaleString()}** claimed in this server`,
          `**${guildRollers.toLocaleString()}** collectors here`,
        ].join('\n'),
      },
      {
        name: '🔗 Links',
        value: [
          '🌐 [Website](https://wikiroll.hackatoa.com)',
          '➕ [Add to Discord](https://discord.com/api/oauth2/authorize?client_id=1343100226537259018&permissions=126016&scope=bot%20applications.commands)',
          '💻 [GitHub](https://github.com/Hackatoan/wikiroll)',
          '☕ [Buy Me a Coffee](https://buymeacoffee.com/hackatoa)',
        ].join('\n'),
      },
      {
        name: '⚡ Quick Start',
        value: '`w.roll` to roll 10 characters · click a button to claim · `w.c` to view collection',
      },
    )
    .setFooter({ text: 'Built by Hackatoa · hackatoa.com' })
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function prefixHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('WikiRoll — Commands')
    .setDescription('Also available as slash commands (`/roll`, `/collection`, etc.)')
    .addFields(
      { name: '🎲 Rolling', value: '`w.roll` — Roll 10 characters (1hr cooldown)\n`w.daily` — Free daily roll (streak bonus at 2+ days)' },
      { name: '📦 Collection', value: '`w.collection [@user] [page]`\n`w.info <name>`\n`w.remove <name>`' },
      { name: '🔍 Search', value: '`w.search <query>` — Find characters, see who owns them' },
      { name: '🔄 Trading', value: '`w.trade @user <your char> <their char>`' },
      { name: '⭐ Wishlist', value: '`w.wl view` · `w.wl add <name>` · `w.wl rm <name>`\n`w.wl addsource <url_or_keyword>` · `w.wl sources`' },
    )
    .setFooter({ text: 'Wishlisted characters & sources appear more often in rolls!' });
  await message.reply({ embeds: [embed] });
}
