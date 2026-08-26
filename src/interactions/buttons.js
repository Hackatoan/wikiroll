import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts, getCharsByIds, getSettings, getLinkedGuildIds, getOwnerCrossGuild } from '../database.js';
import { buildRollEmbeds, buildClaimSelect } from '../embeds.js';
import { pendingWishCandidates } from '../commands/wishlist.js';
import { buildWishCharEmbed } from '../embeds.js';
import { t } from '../i18n.js';

function fmtTimeLeft(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export async function handleButtonInteraction(interaction) {
  const [type, ...parts] = interaction.customId.split('_');
  if (type === 'trade') return handleTrade(interaction, parts);
}

export async function handleSelectInteraction(interaction) {
  if (interaction.customId.startsWith('claimselect_')) {
    const rollId = parseInt(interaction.customId.split('_')[1]);
    const idx = parseInt(interaction.values[0]);
    return handleClaim(interaction, rollId, idx);
  }
  if (interaction.customId.startsWith('wishpick_')) {
    return handleWishPick(interaction);
  }
}

async function handleWishPick(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const [, userId, guildId] = interaction.customId.split('_');

  if (interaction.user.id !== userId) {
    return interaction.editReply(t(interaction.guildId, 'btn.notForYou'));
  }

  const storeKey = `${userId}:${guildId}`;
  const candidates = pendingWishCandidates.get(storeKey);
  if (!candidates) {
    return interaction.editReply(t(interaction.guildId, 'wish.selectExpired'));
  }

  const values = interaction.values;
  const toAdd = values.includes('__all__') ? candidates : values.map(v => candidates[parseInt(v)]);

  pendingWishCandidates.delete(storeKey);

  const added = [];
  const addedChars = [];
  for (const char of toAdd) {
    try {
      const charId = char._fromDb && char.id ? char.id : stmts.upsertChar.get(char).id;
      stmts.addWish.run(userId, guildId, charId, char.name);
      added.push(char.name);
      addedChars.push(char);
    } catch {}
  }

  if (!added.length) return interaction.editReply(t(interaction.guildId, 'wish.nothingAdded'));
  return interaction.editReply({
    content: added.length > 1 ? t(interaction.guildId, 'wish.addedMany', { n: added.length }) : null,
    embeds: addedChars.map(c => buildWishCharEmbed(c)),
  });
}

async function handleClaim(interaction, rollIdInt, idx) {
  await interaction.deferReply({ ephemeral: true });

  const roll = stmts.getRoll.get(rollIdInt);
  if (!roll) return interaction.editReply(t(interaction.guildId, 'claim.rollGone'));

  const now = Math.floor(Date.now() / 1000);
  if (now > roll.expires_at) return interaction.editReply(t(interaction.guildId, 'claim.rollExpired'));

  const charIds = JSON.parse(roll.character_ids);
  const charId = charIds[idx];
  if (charId === undefined) return interaction.editReply(t(interaction.guildId, 'claim.invalid'));

  const guildId   = interaction.guildId;
  const userId    = interaction.user.id;
  const settings  = getSettings(guildId);
  const cooldownSecs = settings.roll_cooldown_minutes * 60;

  // Daily rolls: the original roller bypasses claim cooldown while daily_claims > 0
  const isDailyBonus = roll.daily_claims > 0 && userId === roll.user_id;

  if (!isDailyBonus) {
    const cd = stmts.getCooldown.get(userId, guildId);
    if (cd?.last_claim) {
      const elapsed = now - cd.last_claim;
      if (elapsed < cooldownSecs) {
        const left = cooldownSecs - elapsed;
        return interaction.editReply(t(interaction.guildId, 'claim.cooldown', { time: fmtTimeLeft(left) }));
      }
    }
  }

  const linkedGuilds = getLinkedGuildIds(guildId);
  const existing = getOwnerCrossGuild(linkedGuilds, charId);
  if (existing) {
    return interaction.editReply(t(interaction.guildId, 'claim.alreadyClaimed', { owner: `<@${existing.user_id}>` }));
  }

  const result = stmts.claim.run(guildId, userId, charId);
  if (result.changes === 0) {
    const owner = getOwnerCrossGuild(linkedGuilds, charId);
    return interaction.editReply(t(interaction.guildId, 'claim.tooSlow', { owner: `<@${owner?.user_id}>` }));
  }

  const chars = getCharsByIds(charIds);
  const claimed = chars.find(c => c.id === charId);

  if (isDailyBonus) {
    stmts.decrementDailyClaims.run(rollIdInt);
  }
  stmts.setClaimCooldown.run(userId, guildId);

  const remaining = isDailyBonus ? roll.daily_claims - 1 : 0;
  const claimsLine = remaining > 0
    ? t(interaction.guildId, 'claim.dailyRemaining', { n: remaining })
    : '';

  await interaction.editReply(
    t(interaction.guildId, 'claim.success', { char: claimed?.name ?? 'Character', extra: claimsLine })
  );

  // Rebuild message: remove claimed button, update embed, post public announcement
  try {
    const channel = interaction.channel ?? await interaction.client.channels.fetch(roll.channel_id);
    const msg = await channel.messages.fetch(roll.message_id);
    const claimedSet = new Set();
    for (let i = 0; i < charIds.length; i++) {
      if (getOwnerCrossGuild(linkedGuilds, charIds[i])) claimedSet.add(i);
    }
    const embeds = buildRollEmbeds(chars, claimedSet);
    const components = buildClaimSelect(rollIdInt, chars, claimedSet, interaction.guildId);
    await msg.edit({ embeds, components });
    await channel.send(t(interaction.guildId, 'claim.announce', { user: `<@${userId}>`, char: claimed?.name ?? 'a character' }));
  } catch {}

}

async function handleTrade(interaction, [action, tradeIdStr]) {
  await interaction.deferReply({ ephemeral: true });
  const tradeId = parseInt(tradeIdStr);
  const trade = stmts.getTrade.get(tradeId);

  if (!trade) return interaction.editReply(t(interaction.guildId, 'trade.inactive'));
  if (Math.floor(Date.now() / 1000) > trade.expires_at) {
    stmts.setTradeStatus.run('expired', tradeId);
    return interaction.editReply(t(interaction.guildId, 'trade.offerExpired'));
  }
  if (interaction.user.id !== trade.target_id) {
    return interaction.editReply(t(interaction.guildId, 'trade.notForYou'));
  }

  if (action === 'accept') {
    const initOwn = stmts.getOwner.get(trade.guild_id, trade.initiator_char_id);
    if (!initOwn || initOwn.user_id !== trade.initiator_id) {
      stmts.setTradeStatus.run('cancelled', tradeId);
      return interaction.editReply(t(interaction.guildId, 'trade.cancelInit'));
    }
    if (trade.target_char_id !== null) {
      const tgtOwn = stmts.getOwner.get(trade.guild_id, trade.target_char_id);
      if (!tgtOwn || tgtOwn.user_id !== trade.target_id) {
        stmts.setTradeStatus.run('cancelled', tradeId);
        return interaction.editReply(t(interaction.guildId, 'trade.cancelTarget'));
      }
      stmts.transferChar.run(trade.initiator_id, trade.guild_id, trade.target_char_id, trade.target_id);
    }
    stmts.transferChar.run(trade.target_id, trade.guild_id, trade.initiator_char_id, trade.initiator_id);
    stmts.setTradeStatus.run('completed', tradeId);
    const isGift = trade.target_char_id === null;
    await interaction.editReply(isGift ? t(interaction.guildId, 'trade.giftAccepted') : t(interaction.guildId, 'trade.completed'));
    try {
      const ch = interaction.channel ?? await interaction.client.channels.fetch(trade.channel_id ?? interaction.channelId);
      const msg = await ch.messages.fetch(trade.message_id);
      await msg.edit({
        content: isGift
          ? t(interaction.guildId, 'trade.giftAcceptedPublic', { target: `<@${trade.target_id}>`, initiator: `<@${trade.initiator_id}>` })
          : t(interaction.guildId, 'trade.completedPublic', { initiator: `<@${trade.initiator_id}>`, target: `<@${trade.target_id}>` }),
        components: [],
      });
    } catch {}
  } else {
    stmts.setTradeStatus.run('declined', tradeId);
    await interaction.editReply(t(interaction.guildId, 'trade.declined'));
    try {
      const ch = interaction.channel ?? await interaction.client.channels.fetch(trade.channel_id ?? interaction.channelId);
      const msg = await ch.messages.fetch(trade.message_id);
      await msg.edit({ content: t(interaction.guildId, 'trade.declinedPublic', { target: `<@${trade.target_id}>` }), components: [] });
    } catch {}
  }
}

