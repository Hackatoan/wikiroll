/**
 * Prefix command handler for `w.` commands
 * Mirrors slash commands but via chat messages.
 */
import { db, stmts, getCharsByIds, getSettings, getLinkedGuildIds, getUserCollectionCrossGuild, getOwnerCrossGuild } from './database.js';
import { fetchTenCharacters, searchWikipedia, fetchWikiPage } from './wiki.js';
import {
  buildRollEmbeds, buildClaimSelect, buildCollectionEmbed,
  buildSearchEmbed, buildCharInfoEmbed, buildWishlistEmbeds,
  buildSettingsEmbed,
} from './embeds.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { t } from './i18n.js';

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
    message.reply(t(message.guild?.id, 'px.genericError')).catch(() => {});
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
      return message.reply(t(message.guild?.id, 'px.rollCd', { mins }));
    }
  }

  const rolling = await message.reply(t(message.guild?.id, 'px.rolling'));

  const guildSources  = stmts.getSources.all(guildId).map(s => s.wiki_url);
  const wishedChars   = stmts.getGuildWishChars.all(guildId);
  const wishedSources = stmts.getGuildWishSources.all(guildId);

  const rawChars = await fetchTenCharacters({ guildSources, wishedChars, wishedSources });
  if (!rawChars.length) {
    return rolling.edit(t(message.guild?.id, 'px.fetchFail'));
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
  const components = buildClaimSelect(rollId, chars);
  const mins = settings.claim_window_minutes;

  const msg = await rolling.edit({
    content: t(message.guild?.id, 'px.rolled', { user: message.author.username, mins }),
    embeds,
    components,
  });

  stmts.setRollMessageId.run(msg.id, rollId);

  setTimeout(async () => {
    try { await msg.edit({ content: t(message.guild?.id, 'px.rollExp', { user: message.author.username }), embeds, components: [] }); } catch {}
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
    return message.reply(t(message.guild?.id, 'px.dailyRestrict', { channel: `<#${settings.roll_channel}>` }));
  }

  const dailyRec = stmts.getDaily.get(userId, guildId);

  if (dailyRec?.last_daily === today) {
    const secsLeft = secsTillMidnightInTz(tz);
    const h = Math.floor(secsLeft / 3600);
    const m = Math.ceil((secsLeft % 3600) / 60);
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return message.reply(t(message.guild?.id, 'px.dailyAlready', { time: timeStr }));
  }

  const streak = dailyRec?.last_daily === yesterday
    ? Math.min(dailyRec.streak + 1, 100)
    : 1;

  const claims = Math.min(streak >= 2 ? 2 : 1, 2);

  stmts.setDaily.run(userId, guildId, today, streak);

  const rolling = await message.reply(t(message.guild?.id, 'px.dailyRolling'));

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
  const components = buildClaimSelect(rollId, chars);
  const mins       = settings.claim_window_minutes;

  const streakLine = streak >= 2
    ? t(message.guild?.id, 'px.dailyStreak', { streak, claims })
    : '';

  const msg = await rolling.edit({
    content: t(message.guild?.id, 'px.dailyRolled', { user: message.author.username, streak: streakLine, mins }),
    embeds,
    components,
  });

  stmts.setRollMessageId.run(msg.id, rollId);

  setTimeout(async () => {
    try {
      await msg.edit({
        content: t(message.guild?.id, 'px.dailyExp', { user: message.author.username }),
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

  const chars      = getUserCollectionCrossGuild(getLinkedGuildIds(guildId), target.id);
  const totalPages = Math.max(1, Math.ceil(chars.length / 12));
  const safePage   = Math.min(page, totalPages);
  const embed      = buildCollectionEmbed(target, chars, safePage, message.guild?.id);

  const rows = [];
  if (totalPages > 1) {
    const ar = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`col_${target.id}_${safePage - 1}`).setLabel(t(message.guild?.id, 'btn.prev')).setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 1),
      new ButtonBuilder().setCustomId(`col_${target.id}_${safePage + 1}`).setLabel(t(message.guild?.id, 'btn.next')).setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages)
    );
    rows.push(ar);
  }
  await message.reply({ embeds: [embed], components: rows });
}

// ── Search ────────────────────────────────────────────────────────────────

async function prefixSearch(message, query, guildId) {
  if (!query) return message.reply(t(message.guild?.id, 'px.uSearch'));
  const placeholder = await message.reply(t(message.guild?.id, 'px.searching'));

  let results = stmts.searchChars.all(guildId, `%${query}%`);
  if (results.length < 3) {
    const titles = await searchWikipedia(query);
    for (const title of titles) {
      if (results.some(r => r.name.toLowerCase() === title.toLowerCase())) continue;
      const char = await fetchWikiPage(title);
      if (!char) continue;
      try {
        const row = stmts.upsertChar.get(char);
        const owner = getOwnerCrossGuild(getLinkedGuildIds(guildId), row.id);
        results.push({ ...char, id: row.id, owner_id: owner?.user_id ?? null });
      } catch {}
    }
  }
  await placeholder.edit({ content: '', embeds: [buildSearchEmbed(results, query, message.guild?.id)] });
}

// ── Info ──────────────────────────────────────────────────────────────────

async function prefixInfo(message, name, guildId) {
  if (!name) return message.reply(t(message.guild?.id, 'px.uInfo'));
  const results = stmts.searchChars.all(guildId, `%${name}%`);
  if (!results.length) return message.reply(t(message.guild?.id, 'px.infoNF', { name }));
  const char  = results[0];
  const owner = getOwnerCrossGuild(getLinkedGuildIds(guildId), char.id);
  await message.reply({ embeds: [buildCharInfoEmbed(char, owner?.user_id ?? null, message.guild?.id)] });
}

// ── Trade ─────────────────────────────────────────────────────────────────

async function prefixTrade(message, args, guildId, userId) {
  // w.trade @user <offer> <want>
  const target = message.mentions.users.first();
  if (!target) return message.reply(t(message.guild?.id, 'px.uTrade'));

  const nonMentionArgs = args.filter(a => !a.startsWith('<@'));
  if (nonMentionArgs.length < 2) return message.reply(t(message.guild?.id, 'px.uTrade'));

  const offerQ   = nonMentionArgs[0];
  const requestQ = nonMentionArgs.slice(1).join(' ');

  if (target.id === userId)  return message.reply(t(message.guild?.id, 'px.tSelf'));
  if (target.bot)            return message.reply(t(message.guild?.id, 'px.tBot'));

  const myChars    = stmts.searchChars.all(guildId, `%${offerQ}%`).filter(c => c.owner_id === userId);
  if (!myChars.length) return message.reply(t(message.guild?.id, 'px.tNoOffer', { q: offerQ }));

  const theirChars = stmts.searchChars.all(guildId, `%${requestQ}%`).filter(c => c.owner_id === target.id);
  if (!theirChars.length) return message.reply(t(message.guild?.id, 'px.tNoTheir', { target: `<@${target.id}>`, q: requestQ }));

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
  const embed = buildTradeEmbed(message.author.username, target.username, offerChar, requestChar, message.guild?.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade_accept_${tradeId}`).setLabel(t(message.guild?.id, 'btn.accept')).setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`trade_decline_${tradeId}`).setLabel(t(message.guild?.id, 'btn.decline')).setStyle(ButtonStyle.Danger).setEmoji('❌')
  );

  const msg = await message.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
  stmts.setTradeMessageId.run(msg.id, tradeId);

  setTimeout(async () => {
    try { await msg.edit({ content: t(message.guild?.id, 'px.tExp'), embeds: [], components: [] }); } catch {}
  }, 600_000);
}

// ── Remove ────────────────────────────────────────────────────────────────

async function prefixRemove(message, name, guildId, userId) {
  if (!name) return message.reply(t(message.guild?.id, 'px.uRemove'));
  const results = stmts.searchChars.all(guildId, `%${name}%`);
  const owned   = results.filter(c => c.owner_id === userId);
  if (!owned.length) return message.reply(t(message.guild?.id, 'px.rmNoOwn', { name }));
  if (owned.length > 1) {
    return message.reply(t(message.guild?.id, 'px.rmMulti', { list: owned.slice(0,5).map((c,i)=>`${i+1}. ${c.name}`).join('\n') }));
  }
  stmts.removeChar.run(guildId, userId, owned[0].id);
  await message.reply(t(message.guild?.id, 'px.rmDone', { char: owned[0].name }));
}

// ── Wishlist ──────────────────────────────────────────────────────────────

async function prefixWishlist(message, args, guildId, userId) {
  const sub  = (args[0] ?? 'view').toLowerCase();
  const rest = args.slice(1).join(' ');

  if (sub === 'view' || !args.length) {
    const items = stmts.getUserWishlist.all(userId, guildId);
    return message.reply({ embeds: buildWishlistEmbeds(message.author, items, message.guild?.id) });
  }

  if (sub === 'add') {
    if (!rest) return message.reply(t(message.guild?.id, 'px.uWlAdd'));
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
    if (!charId) return message.reply(t(message.guild?.id, 'px.wlCharNF', { name: rest }));
    stmts.addWish.run(userId, guildId, charId, charName);
    return message.reply(t(message.guild?.id, 'px.wlAdded', { char: charName }));
  }

  if (sub === 'remove' || sub === 'rm') {
    const local = stmts.searchChars.all(guildId, `%${rest}%`);
    if (!local.length) return message.reply(t(message.guild?.id, 'px.wlRmNF', { name: rest }));
    stmts.removeWish.run(userId, guildId, local[0].id);
    return message.reply(t(message.guild?.id, 'px.wlRemoved', { char: local[0].name }));
  }

  if (sub === 'addsource' || sub === 'as') {
    if (!rest) return message.reply(t(message.guild?.id, 'px.uWlAddsrc'));
    const isUrl = rest.includes('.fandom.com') || rest.startsWith('http');
    let sourceType, sourceValue, displayName;
    if (isUrl) {
      try {
        const parsed = new URL(rest.startsWith('http') ? rest : `https://${rest}`);
        sourceType = 'fandom'; sourceValue = `${parsed.protocol}//${parsed.hostname}`; displayName = parsed.hostname;
      } catch { return message.reply(t(message.guild?.id, 'px.invalidUrl2')); }
    } else {
      sourceType = 'search'; sourceValue = rest; displayName = rest;
    }
    stmts.addWishSource.run(userId, guildId, sourceType, sourceValue, displayName);
    return message.reply(t(message.guild?.id, 'px.wlSrcAdded', { name: displayName }));
  }

  if (sub === 'sources' || sub === 'src') {
    const sources = stmts.getUserWishSources.all(userId, guildId);
    if (!sources.length) return message.reply(t(message.guild?.id, 'px.wlNoSrc'));
    const lines = sources.map(s => `• **${s.display_name ?? s.source_value}** *(${s.source_type})*`);
    return message.reply(t(message.guild?.id, 'px.wlSources', { list: lines.join('\n') }));
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
    .setDescription(t(message.guild?.id, 'px.aboutDesc'))
    .addFields(
      {
        name: t(message.guild?.id, 'about.stats'),
        value: t(message.guild?.id, 'about.statsV', { total: totalChars.toLocaleString(), owned: guildOwned.toLocaleString(), rollers: guildRollers.toLocaleString() }),
      },
      {
        name: t(message.guild?.id, 'about.links'),
        value: t(message.guild?.id, 'px.aboutLinksV'),
      },
      {
        name: t(message.guild?.id, 'about.quickStart'),
        value: t(message.guild?.id, 'px.aboutQuickV'),
      },
    )
    .setFooter({ text: t(message.guild?.id, 'about.footer') })
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

async function prefixHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(t(message.guild?.id, 'help.title'))
    .setDescription(t(message.guild?.id, 'px.helpDesc'))
    .addFields(
      {
        name: t(message.guild?.id, 'help.rolling'),
        value: t(message.guild?.id, 'px.pxHelpRollV'),
      },
      {
        name: t(message.guild?.id, 'help.collection'),
        value: t(message.guild?.id, 'px.pxHelpColV'),
      },
      {
        name: t(message.guild?.id, 'help.social'),
        value: t(message.guild?.id, 'px.pxHelpSocialV'),
      },
      {
        name: t(message.guild?.id, 'px.pxHelpSetup'),
        value: t(message.guild?.id, 'px.pxHelpSetupV'),
      },
      {
        name: t(message.guild?.id, 'help.other'),
        value: t(message.guild?.id, 'px.pxHelpOtherV'),
      },
    )
    .setFooter({ text: t(message.guild?.id, 'px.pxHelpFooter') });
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

  if (!rows.length) return message.reply(t(message.guild?.id, 'px.lbEmpty'));

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const { user_id, total } = rows[i];
    const medal = MEDALS[i] ?? `**${i + 1}.**`;
    let name;
    try { name = (await message.guild.members.fetch(user_id)).displayName; }
    catch { try { name = (await message.client.users.fetch(user_id)).username; } catch { name = `<@${user_id}>`; } }
    const highlight = user_id === message.author.id ? t(message.guild?.id, 'lb.you') : '';
    lines.push(t(message.guild?.id, 'lb.entry', { medal, name, total, you: highlight }));
  }

  let footerText = t(message.guild?.id, 'lb.footerTotal', { total: rows.reduce((s, r) => s + r.total, 0) });
  if (!rows.some(r => r.user_id === message.author.id)) {
    const me = db.prepare(`SELECT COUNT(*) AS total FROM ownership WHERE guild_id = ? AND user_id = ?`).get(guildId, message.author.id);
    if (me?.total > 0) {
      const rank = db.prepare(`SELECT COUNT(DISTINCT user_id) AS r FROM ownership WHERE guild_id = ? AND user_id IN (SELECT user_id FROM ownership WHERE guild_id = ? GROUP BY user_id HAVING COUNT(*) >= ?)`).get(guildId, guildId, me.total);
      footerText += t(message.guild?.id, 'lb.footerRank', { rank: rank?.r ?? '?', n: me.total });
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(t(message.guild?.id, 'lb.title', { guild: message.guild.name }))
    .setDescription(lines.join('\n'))
    .setFooter({ text: footerText })
    .setTimestamp();
  await message.reply({ embeds: [embed] });
}

// ── Server ────────────────────────────────────────────────────────────────────

async function prefixServer(message) {
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(t(message.guild?.id, 'server.title'))
    .setDescription(t(message.guild?.id, 'server.desc'))
    .addFields({ name: t(message.guild?.id, 'server.inviteField'), value: '[discord.gg/7eh3q2u8V](https://discord.gg/7eh3q2u8V)' })
    .setFooter({ text: t(message.guild?.id, 'server.footer') });
  await message.reply({ embeds: [embed] });
}

// ── Vote ──────────────────────────────────────────────────────────────────────

async function prefixVote(message) {
  const embed = new EmbedBuilder()
    .setColor(0xff3366)
    .setTitle(t(message.guild?.id, 'vote.title'))
    .setDescription(t(message.guild?.id, 'px.voteDesc'))
    .addFields({ name: t(message.guild?.id, 'vote.linkField'), value: '[Vote on top.gg](https://top.gg/bot/1343100226537259018/vote)' })
    .setFooter({ text: t(message.guild?.id, 'vote.footer') });
  await message.reply({ embeds: [embed] });
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function prefixSettings(message, args, guildId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply(t(message.guild?.id, 'px.permSettings'));
  }

  const sub = (args[0] ?? 'view').toLowerCase();

  if (sub === 'view') {
    const settings = getSettings(guildId);
    return message.reply({ embeds: [buildSettingsEmbed(settings, message.guild?.id)] });
  }

  if (sub === 'cooldown') {
    const mins = parseInt(args[1]);
    if (!mins || mins < 1 || mins > 1440) return message.reply(t(message.guild?.id, 'px.uSetCd'));
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: mins, claim_window_minutes: null, notify_channel: null, timezone: null });
    t(message.guild?.id, 'settings.cooldownSet', { mins })
  }

  if (sub === 'claimwindow') {
    const mins = parseInt(args[1]);
    if (!mins || mins < 1 || mins > 60) return message.reply(t(message.guild?.id, 'px.uSetCw'));
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: null, claim_window_minutes: mins, notify_channel: null, timezone: null });
    t(message.guild?.id, 'settings.claimSet', { mins })
  }

  if (sub === 'notifychannel') {
    const ch = message.mentions.channels.first() ?? null;
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: null, claim_window_minutes: null, notify_channel: ch?.id ?? null, timezone: null });
    return message.reply(ch ? t(message.guild?.id, 'settings.notifySet', { channel: `<#${ch.id}>` }) : t(message.guild?.id, 'settings.notifyCleared'));
  }

  if (sub === 'timezone') {
    const tz = args[1];
    if (!tz) return message.reply(t(message.guild?.id, 'px.uSetTz'));
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { return message.reply(t(message.guild?.id, 'px.invalidTz')); }
    stmts.upsertSettings.run({ guild_id: guildId, roll_cooldown_minutes: null, claim_window_minutes: null, notify_channel: null, timezone: tz });
    return message.reply(t(message.guild?.id, 'px.tzSetShort', { tz }));
  }

  return message.reply(t(message.guild?.id, 'px.uSetMain'));
}

// ── Source ────────────────────────────────────────────────────────────────────

async function prefixSource(message, args, guildId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply(t(message.guild?.id, 'px.permSource'));
  }

  const sub = (args[0] ?? 'list').toLowerCase();

  if (sub === 'list') {
    const sources = stmts.getSources.all(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle(t(message.guild?.id, 'source.title'))
      .setDescription(sources.length ? sources.map(s => t(message.guild?.id, 'source.line', { name: s.wiki_name ?? s.wiki_url, url: s.wiki_url })).join('\n') : t(message.guild?.id, 'px.sourceNone'));
    return message.reply({ embeds: [embed] });
  }

  const rawUrl = args[1];
  if (!rawUrl) return message.reply(t(message.guild?.id, 'px.uSource', { sub }));
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return message.reply(t(message.guild?.id, 'source.invalidUrl')); }
  const cleanUrl = `${parsed.protocol}//${parsed.hostname}`;

  if (sub === 'add') {
    const name = args[2] ?? parsed.hostname;
    stmts.addSource.run(guildId, cleanUrl, name, message.author.id);
    t(message.guild?.id, 'source.added', { name, url: cleanUrl })
  }

  if (sub === 'remove' || sub === 'rm') {
    stmts.removeSource.run(guildId, cleanUrl);
    t(message.guild?.id, 'source.removed', { url: cleanUrl })
  }

  return message.reply(t(message.guild?.id, 'px.uSourceMain'));
}

// ── Submit Image ──────────────────────────────────────────────────────────────

async function prefixSubmitimage(message, args, guildId) {
  if (args.length < 2) return message.reply(t(message.guild?.id, 'px.uSi'));
  const url = args[args.length - 1];
  const name = args.slice(0, -1).join(' ');
  try { new URL(url); } catch { return message.reply(t(message.guild?.id, 'source.invalidUrl')); }
  const results = stmts.searchChars.all(guildId, `%${name}%`);
  if (!results.length) return message.reply(t(message.guild?.id, 'px.siNF', { name }));
  stmts.setUserImage.run(url, results[0].id);
  t(message.guild?.id, 'submitimage.updated', { char: results[0].name })
}

// ── Set Roll Channel ──────────────────────────────────────────────────────────

async function prefixSetrollchannel(message, args, guildId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply(t(message.guild?.id, 'px.permManage'));
  }

  const sub = (args[0] ?? 'set').toLowerCase();

  if (sub === 'clear') {
    stmts.setRollChannel.run(guildId, null);
    t(message.guild?.id, 'setroll.cleared')
  }

  const channel = message.mentions.channels.first() ?? message.channel;
  stmts.setRollChannel.run(guildId, channel.id);
  t(message.guild?.id, 'setroll.set', { channel: `<#${channel.id}>` })
}

// ── Link Server ───────────────────────────────────────────────────────────────

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function prefixLinkserver(message, args, guildId, userId) {
  if (!message.member.permissions.has('ManageGuild')) {
    return message.reply(t(message.guild?.id, 'px.permManage'));
  }

  const sub = (args[0] ?? 'status').toLowerCase();

  if (sub === 'start') {
    const targetGuild = args[1];
    if (!targetGuild) return message.reply(t(message.guild?.id, 'px.uLinkStart'));
    t(message.guild?.id, 'link.selfLink')
    const existing = stmts.getGuildLinks.all(guildId, guildId);
    if (existing.some(r => r.other_guild === targetGuild)) return message.reply(t(message.guild?.id, 'link.already'));
    const code = randomCode();
    stmts.createLinkRequest.run(guildId, userId, targetGuild, code, Math.floor(Date.now() / 1000) + 86400);
    return message.reply(t(message.guild?.id, 'px.linkCreated', { target: targetGuild, code }));
  }

  if (sub === 'confirm') {
    const code = args[1]?.toUpperCase();
    if (!code) return message.reply(t(message.guild?.id, 'px.uLinkConfirm'));
    const request = stmts.getLinkRequest.get(code);
    if (!request) return message.reply(t(message.guild?.id, 'link.invalidCode'));
    if (request.target_guild !== guildId) return message.reply(t(message.guild?.id, 'link.wrongServer', { server: request.target_guild }));
    if (request.initiator_guild === guildId) return message.reply(t(message.guild?.id, 'link.ownRequest'));
    stmts.createLink.run(request.initiator_guild, guildId);
    stmts.createLink.run(guildId, request.initiator_guild);
    stmts.deleteLinkRequest.run(code);
    return message.reply(t(message.guild?.id, 'px.linkConfirmed', { server: request.initiator_guild }));
  }

  if (sub === 'status') {
    const links = stmts.getGuildLinks.all(guildId, guildId);
    const pending = stmts.getPendingLinksByGuild.all(guildId, guildId);
    let msg = links.length ? t(message.guild?.id, 'link.linkedHeader', { list: links.map(r => `• \`${r.other_guild}\``).join('\n') }) : t(message.guild?.id, 'link.linkedNone');
    const outgoing = pending.filter(r => r.initiator_guild === guildId);
    const incoming = pending.filter(r => r.target_guild === guildId);
    if (outgoing.length) msg += t(message.guild?.id, 'link.outgoing', { list: outgoing.map(r => `• \`${r.code}\` → \`${r.target_guild}\``).join('\n') });
    if (incoming.length) msg += t(message.guild?.id, 'link.incoming', { list: incoming.map(r => `• \`${r.code}\` — \`${r.initiator_guild}\``).join('\n') });
    return message.reply(msg.trim() || t(message.guild?.id, 'link.noneAll'));
  }

  if (sub === 'unlink') {
    const targetGuild = args[1];
    if (!targetGuild) return message.reply(t(message.guild?.id, 'px.uLinkUnlink'));
    stmts.removeLink.run(guildId, targetGuild, targetGuild, guildId);
    return message.reply(t(message.guild?.id, 'link.unlinked', { server: targetGuild }));
  }

  return message.reply(t(message.guild?.id, 'px.uLinkMain'));
}
