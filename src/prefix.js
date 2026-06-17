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

function todayInTz(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function yesterdayInTz(tz) {
  return new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: tz });
}

function secsTillMidnightInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour').value);
  const m = parseInt(parts.find(p => p.type === 'minute').value);
  const s = parseInt(parts.find(p => p.type === 'second').value);
  return 86400 - (h * 3600 + m * 60 + s);
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
      case 'leaderboard':
      case 'lb':         return await prefixLeaderboard(message, guildId);
      case 'server':     return await prefixServer(message);
      case 'vote':       return await prefixVote(message);
      case 'settings':   return await prefixSettings(message, args, guildId);
      case 'source':     return await prefixSource(message, args, guildId);
      case 'submitimage':
      case 'si':         return await prefixSubmitimage(message, args, guildId);
      case 'setrollchannel':
      case 'setrc':      return await prefixSetrollchannel(message, args, guildId);
      case 'linkserver': return await prefixLinkserver(message, args, guildId, userId);
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
  const now       = Math.floor(Date.now() / 1000);
  const settings  = getSettings(guildId);
  const tz        = settings.timezone;
  const today     = todayInTz(tz);
  const yesterday = yesterdayInTz(tz);

  if (settings.roll_channel && message.channel.id !== settings.roll_channel) {
    return message.reply(`🗓️ Daily rolls are restricted to <#${settings.roll_channel}>.`);
  }

  const dailyRec = stmts.getDaily.get(userId, guildId);

  if (dailyRec?.last_daily === today) {
    const secsLeft = secsTillMidnightInTz(tz);
    const h = Math.floor(secsLeft / 3600);
    const m = Math.ceil((secsLeft % 3600) / 60);
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return message.reply(`⏳ Already rolled today. Next daily in **${timeStr}**.`);
  }

  const streak = dailyRec?.last_daily === yesterday
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
    .setColor(0x7c3aed)
    .setTitle('WikiRoll — Commands')
    .setDescription('Also available as slash commands (`/roll`, `/daily`, etc.)')
    .addFields(
      {
        name: '🎲 Rolling & Claiming',
        value: [
          '`w.roll` — Roll 10 characters (1hr cooldown)',
          '`w.daily` — Free daily roll; 2+ day streak = 2 claims',
        ].join('\n'),
      },
      {
        name: '📦 Collection',
        value: [
          '`w.collection [@user] [page]` — View a collection',
          '`w.info <name>` — Detailed info on a character',
          '`w.search <query>` — See if a character is claimed',
          '`w.remove <name>` — Remove a character from your collection',
          '`w.si <name> <url>` — Set a custom image for a character',
        ].join('\n'),
      },
      {
        name: '🤝 Social',
        value: [
          '`w.trade @user <your char> [their char]` — Trade or gift',
          '`w.wl view` · `w.wl add <name>` · `w.wl rm <name>`',
          '`w.wl addsource <url_or_keyword>` · `w.wl sources`',
          '`w.lb` — Top collectors in this server',
        ].join('\n'),
      },
      {
        name: '⚙️ Server Setup (admin)',
        value: [
          '`w.settings view` · `w.settings cooldown <min>` · `w.settings claimwindow <min>`',
          '`w.settings timezone <tz>` · `w.settings notifychannel [#ch]`',
          '`w.source add <url>` · `w.source remove <url>` · `w.source list`',
          '`w.setrc set [#ch]` · `w.setrc clear`',
          '`w.linkserver start <id>` · `w.linkserver confirm <code>` · `w.linkserver status`',
        ].join('\n'),
      },
      {
        name: '🔗 Other',
        value: '`w.about` · `w.vote` · `w.server`',
      },
    )
    .setFooter({ text: 'Wishlisted characters & sources appear more often in rolls! · wikiroll.hackatoa.com' });
  await message.reply({ embeds: [embed] });
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];

async function prefixLeaderboard(message, guildId) {
  const rows = db.prepare(`
    SELECT user_id, COUNT(*) AS total
    FROM ownership WHERE guild_id = ?
    GROUP BY user_id ORDER BY total DESC LIMIT 10
  `).all(guildId);

  if (!rows.length) return message.reply('📭 No one has claimed anything yet — use `w.roll` to get started!');

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const { user_id, total } = rows[i];
    const medal = MEDALS[i] ?? `**${i + 1}.**`;
    let name;
    try { name = (await message.guild.members.fetch(user_id)).displayName; }
    catch { try { name = (await message.client.users.fetch(user_id)).username; } catch { name = `<@${user_id}>`; } }
    const highlight = user_id === message.author.id ? ' ← you' : '';
    lines.push(`${medal} **${name}** — ${total} character${total !== 1 ? 's' : ''}${highlight}`);
  }

  let footerText = `${rows.reduce((s, r) => s + r.total, 0)} characters claimed total`;
  if (!rows.some(r => r.user_id === message.author.id)) {
    const me = db.prepare(`SELECT COUNT(*) AS total FROM ownership WHERE guild_id = ? AND user_id = ?`).get(guildId, message.author.id);
    if (me?.total > 0) {
      const rank = db.prepare(`SELECT COUNT(DISTINCT user_id) AS r FROM ownership WHERE guild_id = ? AND user_id IN (SELECT user_id FROM ownership WHERE guild_id = ? GROUP BY user_id HAVING COUNT(*) >= ?)`).get(guildId, guildId, me.total);
      footerText += ` · You're #${rank?.r ?? '?'} with ${me.total}`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(`🏆 ${message.guild.name} — Top Collectors`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: footerText })
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

// ── Server ────────────────────────────────────────────────────────────────────

async function prefixServer(message) {
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('🚀 Orbital Outpost')
    .setDescription('The official community server for WikiRoll and all things Hackatoa.\n\nHang out, share your collection, report bugs, suggest features, and chat with the dev.')
    .addFields({ name: '🔗 Invite Link', value: '[discord.gg/7eh3q2u8V](https://discord.gg/7eh3q2u8V)' })
    .setFooter({ text: 'Homelab talk · dev projects · gaming · vibes' });
  await message.reply({ embeds: [embed] });
}

// ── Vote ──────────────────────────────────────────────────────────────────────

async function prefixVote(message) {
  const embed = new EmbedBuilder()
    .setColor(0xff3366)
    .setTitle('🗳️ Vote for WikiRoll')
    .setDescription('Voting helps WikiRoll grow and reach more servers. It takes 5 seconds and is completely free!')
    .addFields({ name: '🔗 Vote Link', value: '[Vote on top.gg](https://top.gg/bot/1343100226537259018/vote)' })
    .setFooter({ text: 'top.gg votes refresh every 12 hours' });
  await message.reply({ embeds: [embed] });
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function prefixSettings(message, args, guildId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply('❌ You need the **Manage Server** permission to change settings.');
  }

  const sub = (args[0] ?? 'view').toLowerCase();

  if (sub === 'view') {
    const settings = getSettings(guildId);
    return message.reply({ embeds: [buildSettingsEmbed(settings)] });
  }

  if (sub === 'cooldown') {
    const mins = parseInt(args[1]);
    if (!mins || mins < 1 || mins > 1440) return message.reply('Usage: `w.settings cooldown <1-1440>`');
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: mins, claim_window_minutes: null, notify_channel: null, timezone: null });
    return message.reply(`✅ Roll cooldown set to **${mins} minutes**.`);
  }

  if (sub === 'claimwindow') {
    const mins = parseInt(args[1]);
    if (!mins || mins < 1 || mins > 60) return message.reply('Usage: `w.settings claimwindow <1-60>`');
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: null, claim_window_minutes: mins, notify_channel: null, timezone: null });
    return message.reply(`✅ Claim window set to **${mins} minutes**.`);
  }

  if (sub === 'notifychannel') {
    const ch = message.mentions.channels.first() ?? null;
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: null, claim_window_minutes: null, notify_channel: ch?.id ?? null, timezone: null });
    return message.reply(ch ? `✅ Notify channel set to <#${ch.id}>.` : '✅ Notify channel cleared.');
  }

  if (sub === 'timezone') {
    const tz = args[1];
    if (!tz) return message.reply('Usage: `w.settings timezone <IANA_tz>` e.g. `America/New_York`');
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return message.reply('❌ Invalid timezone. Use an IANA timezone like `America/New_York`.'); }
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: null, claim_window_minutes: null, notify_channel: null, timezone: tz });
    return message.reply(`✅ Timezone set to **${tz}**.`);
  }

  return message.reply('Usage: `w.settings view|cooldown|claimwindow|notifychannel|timezone`');
}

// ── Source ────────────────────────────────────────────────────────────────────

async function prefixSource(message, args, guildId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply('❌ You need the **Manage Server** permission to manage sources.');
  }

  const sub = (args[0] ?? 'list').toLowerCase();

  if (sub === 'list') {
    const sources = stmts.getSources.all(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('🌐 Wiki Sources')
      .setDescription(sources.length ? sources.map(s => `• **${s.wiki_name ?? s.wiki_url}** — ${s.wiki_url}`).join('\n') : '*No custom sources. Using Wikipedia only.*');
    return message.reply({ embeds: [embed] });
  }

  const rawUrl = args[1];
  if (!rawUrl) return message.reply(`Usage: \`w.source ${sub} <url>\``);
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return message.reply('❌ Invalid URL.'); }
  const cleanUrl = `${parsed.protocol}//${parsed.hostname}`;

  if (sub === 'add') {
    const name = args[2] ?? parsed.hostname;
    stmts.addSource.run(guildId, cleanUrl, name, message.author.id);
    return message.reply(`✅ Added **${name}** (${cleanUrl}) as a roll source!`);
  }

  if (sub === 'remove' || sub === 'rm') {
    stmts.removeSource.run(guildId, cleanUrl);
    return message.reply(`Removed **${cleanUrl}** from sources.`);
  }

  return message.reply('Usage: `w.source list|add|remove`');
}

// ── Submit Image ──────────────────────────────────────────────────────────────

async function prefixSubmitimage(message, args, guildId) {
  if (args.length < 2) return message.reply('Usage: `w.si <name> <url>`');
  const url = args[args.length - 1];
  const name = args.slice(0, -1).join(' ');
  try { new URL(url); } catch { return message.reply('❌ Invalid URL.'); }
  const results = stmts.searchChars.all(guildId, `%${name}%`);
  if (!results.length) return message.reply(`Character **"${name}"** not found. Try \`w.search\` first.`);
  stmts.setUserImage.run(url, results[0].id);
  await message.reply(`🖼️ Image updated for **${results[0].name}**!`);
}

// ── Set Roll Channel ──────────────────────────────────────────────────────────

async function prefixSetrollchannel(message, args, guildId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply('❌ You need the **Manage Server** permission.');
  }

  const sub = (args[0] ?? 'set').toLowerCase();

  if (sub === 'clear') {
    stmts.setRollChannel.run(guildId, null);
    return message.reply('✅ Roll channel restriction removed — rolls allowed anywhere.');
  }

  const channel = message.mentions.channels.first() ?? message.channel;
  stmts.setRollChannel.run(guildId, channel.id);
  return message.reply(`✅ Rolls are now restricted to <#${channel.id}>.`);
}

// ── Link Server ───────────────────────────────────────────────────────────────

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function prefixLinkserver(message, args, guildId, userId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply('❌ You need the **Manage Server** permission.');
  }

  const sub = (args[0] ?? 'status').toLowerCase();

  if (sub === 'start') {
    const targetGuild = args[1];
    if (!targetGuild) return message.reply('Usage: `w.linkserver start <server_id>`');
    if (targetGuild === guildId) return message.reply('❌ Cannot link a server to itself.');
    const existing = stmts.getGuildLinks.all(guildId, guildId);
    if (existing.some(r => r.other_guild === targetGuild)) return message.reply('❌ Already linked with that server.');
    const code = randomCode();
    stmts.createLinkRequest.run(guildId, userId, targetGuild, code, Math.floor(Date.now() / 1000) + 86400);
    return message.reply(`✅ Link request created!\n\nHave an admin in server **${targetGuild}** run:\n\`\`\`\nw.linkserver confirm ${code}\n\`\`\`\nCode expires in 24 hours.`);
  }

  if (sub === 'confirm') {
    const code = args[1]?.toUpperCase();
    if (!code) return message.reply('Usage: `w.linkserver confirm <code>`');
    const request = stmts.getLinkRequest.get(code);
    if (!request) return message.reply('❌ Invalid or expired link code.');
    if (request.target_guild !== guildId) return message.reply(`❌ This code was created for server \`${request.target_guild}\`, not this server.`);
    if (request.initiator_guild === guildId) return message.reply('❌ Cannot confirm your own link request.');
    stmts.createLink.run(request.initiator_guild, guildId);
    stmts.createLink.run(guildId, request.initiator_guild);
    stmts.deleteLinkRequest.run(code);
    return message.reply(`✅ Servers linked! This server and **${request.initiator_guild}** now share claimed character ownership.`);
  }

  if (sub === 'status') {
    const links = stmts.getGuildLinks.all(guildId, guildId);
    const pending = stmts.getPendingLinksByGuild.all(guildId, guildId);
    let msg = links.length ? `**Linked servers:**\n${links.map(r => `• \`${r.other_guild}\``).join('\n')}\n\n` : '**Linked servers:** None\n\n';
    const outgoing = pending.filter(r => r.initiator_guild === guildId);
    const incoming = pending.filter(r => r.target_guild === guildId);
    if (outgoing.length) msg += `**Pending outgoing:**\n${outgoing.map(r => `• Code \`${r.code}\` → \`${r.target_guild}\``).join('\n')}\n\n`;
    if (incoming.length) msg += `**Pending incoming:**\n${incoming.map(r => `• Code \`${r.code}\` from \`${r.initiator_guild}\``).join('\n')}\n\n`;
    return message.reply(msg.trim() || 'No links or pending requests.');
  }

  if (sub === 'unlink') {
    const targetGuild = args[1];
    if (!targetGuild) return message.reply('Usage: `w.linkserver unlink <server_id>`');
    stmts.removeLink.run(guildId, targetGuild, targetGuild, guildId);
    return message.reply(`✅ Unlinked from server \`${targetGuild}\`.`);
  }

  return message.reply('Usage: `w.linkserver start|confirm|status|unlink`');
}
