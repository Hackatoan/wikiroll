import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts, getCharsByIds, getSettings, getLinkedGuildIds, getOwnerCrossGuild } from '../database.js';

function fmtTimeLeft(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
import { buildRollEmbeds, buildClaimButtons } from '../embeds.js';

export async function handleButtonInteraction(interaction) {
  const [type, ...parts] = interaction.customId.split('_');
  if (type === 'claim') return handleClaim(interaction, parts);
  if (type === 'trade') return handleTrade(interaction, parts);
}

async function handleClaim(interaction, [rollId, idxStr]) {
  await interaction.deferReply({ ephemeral: true });

  const rollIdInt = parseInt(rollId);
  const idx = parseInt(idxStr);
  const roll = stmts.getRoll.get(rollIdInt);
  if (!roll) return interaction.editReply('This roll no longer exists.');

  const now = Math.floor(Date.now() / 1000);
  if (now > roll.expires_at) return interaction.editReply('⏰ This roll has expired.');

  const charIds = JSON.parse(roll.character_ids);
  const charId = charIds[idx];
  if (charId === undefined) return interaction.editReply('Invalid selection.');

  const guildId   = interaction.guildId;
  const userId    = interaction.user.id;
  const settings  = getSettings(guildId);
  const cooldownSecs = settings.roll_cooldown_minutes * 60;

  // Per-user claim cooldown — same window as roll cooldown (default 1 hr)
  const cd = stmts.getCooldown.get(userId, guildId);
  if (cd?.last_claim) {
    const elapsed = now - cd.last_claim;
    if (elapsed < cooldownSecs) {
      const left = cooldownSecs - elapsed;
      return interaction.editReply(`⏳ You already claimed a character recently. Try again in **${fmtTimeLeft(left)}**.`);
    }
  }

  const linkedGuilds = getLinkedGuildIds(guildId);
  const existing = getOwnerCrossGuild(linkedGuilds, charId);
  if (existing) {
    return interaction.editReply(`Already claimed by <@${existing.user_id}>!`);
  }

  const result = stmts.claim.run(guildId, userId, charId);
  if (result.changes === 0) {
    const owner = getOwnerCrossGuild(linkedGuilds, charId);
    return interaction.editReply(`Too slow! <@${owner?.user_id}> just grabbed that one.`);
  }

  const chars = getCharsByIds(charIds);
  const claimed = chars.find(c => c.id === charId);

  stmts.setClaimCooldown.run(userId, guildId);

  await interaction.editReply(
    `✅ **${claimed?.name ?? 'Character'}** is now in your collection!`
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
    const components = buildClaimButtons(rollIdInt, chars.length, claimedSet);
    await msg.edit({ embeds, components });
    await channel.send(`🎉 <@${userId}> just claimed **${claimed?.name ?? 'a character'}**!`);
  } catch {}

  // Wishlist DM notifications
  if (claimed) {
    const watchers = stmts.getWishWatchers.all(guildId, charId);
    for (const { user_id } of watchers) {
      if (user_id === interaction.user.id) continue;
      try {
        const u = await interaction.client.users.fetch(user_id);
        await u.send(
          `🔔 **${claimed.name}** (on your wishlist) was just claimed by <@${userId}> in **${interaction.guild?.name}**!`
        );
      } catch {}
    }
  }
}

async function handleTrade(interaction, [action, tradeIdStr]) {
  await interaction.deferReply({ ephemeral: true });
  const tradeId = parseInt(tradeIdStr);
  const trade = stmts.getTrade.get(tradeId);

  if (!trade) return interaction.editReply('This trade is no longer active.');
  if (Math.floor(Date.now() / 1000) > trade.expires_at) {
    stmts.setTradeStatus.run('expired', tradeId);
    return interaction.editReply('⏰ Trade offer expired.');
  }
  if (interaction.user.id !== trade.target_id) {
    return interaction.editReply('This trade offer is not for you.');
  }

  if (action === 'accept') {
    const initOwn = stmts.getOwner.get(trade.guild_id, trade.initiator_char_id);
    if (!initOwn || initOwn.user_id !== trade.initiator_id) {
      stmts.setTradeStatus.run('cancelled', tradeId);
      return interaction.editReply('Trade cancelled — the other user no longer owns that character.');
    }
    if (trade.target_char_id !== null) {
      const tgtOwn = stmts.getOwner.get(trade.guild_id, trade.target_char_id);
      if (!tgtOwn || tgtOwn.user_id !== trade.target_id) {
        stmts.setTradeStatus.run('cancelled', tradeId);
        return interaction.editReply('Trade cancelled — you no longer own the requested character.');
      }
      stmts.transferChar.run(trade.initiator_id, trade.guild_id, trade.target_char_id, trade.target_id);
    }
    stmts.transferChar.run(trade.target_id, trade.guild_id, trade.initiator_char_id, trade.initiator_id);
    stmts.setTradeStatus.run('completed', tradeId);
    const isGift = trade.target_char_id === null;
    await interaction.editReply(isGift ? '✅ Gift accepted!' : '✅ Trade completed!');
    try {
      const ch = interaction.channel ?? await interaction.client.channels.fetch(trade.channel_id ?? interaction.channelId);
      const msg = await ch.messages.fetch(trade.message_id);
      await msg.edit({
        content: isGift
          ? `✅ <@${trade.target_id}> accepted a gift from <@${trade.initiator_id}>!`
          : `✅ Trade completed between <@${trade.initiator_id}> and <@${trade.target_id}>!`,
        components: [],
      });
    } catch {}
  } else {
    stmts.setTradeStatus.run('declined', tradeId);
    await interaction.editReply('Trade declined.');
    try {
      const ch = interaction.channel ?? await interaction.client.channels.fetch(trade.channel_id ?? interaction.channelId);
      const msg = await ch.messages.fetch(trade.message_id);
      await msg.edit({ content: `❌ Trade declined by <@${trade.target_id}>.`, components: [] });
    } catch {}
  }
}
