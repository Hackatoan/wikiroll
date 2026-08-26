import { SlashCommandBuilder } from 'discord.js';
import { stmts, getSettings, db } from '../database.js';
import { fetchTenCharacters } from '../wiki.js';
import { buildRollEmbeds, buildClaimSelect } from '../embeds.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll 10 characters to claim! (Once per hour by default)'),

  async execute(interaction) {
    await interaction.deferReply();

    const userId  = interaction.user.id;
    const guildId = interaction.guildId;
    const now     = Math.floor(Date.now() / 1000);
    const settings = getSettings(guildId);
    const cooldownSecs = settings.roll_cooldown_minutes * 60;

    if (settings.roll_channel && interaction.channelId !== settings.roll_channel) {
      return interaction.editReply({ content: t(guildId, 'roll.restricted', { channel: `<#${settings.roll_channel}>` }), flags: 64 });
    }

    // Check vote credits — spend one to bypass cooldown
    const voteRow = db.prepare('SELECT credits FROM vote_credits WHERE user_id = ?').get(userId);
    const usedVoteCredit = voteRow?.credits > 0;

    if (!usedVoteCredit) {
      const cd = stmts.getCooldown.get(userId, guildId);
      if (cd) {
        const remaining = cooldownSecs - (now - cd.last_roll);
        if (remaining > 0) {
          const mins = Math.ceil(remaining / 60);
          return interaction.editReply(t(guildId, 'roll.cooldown', { mins }));
        }
      }
    }

    if (usedVoteCredit) {
      db.prepare('UPDATE vote_credits SET credits = credits - 1 WHERE user_id = ?').run(userId);
    }

    const guildSources = stmts.getSources.all(guildId).map(s => s.wiki_url);
    const wishedChars  = stmts.getGuildWishChars.all(guildId);

    const rawChars = await fetchTenCharacters({ guildSources, wishedChars });

    if (!rawChars.length) {
      return interaction.editReply(t(guildId, 'roll.fetchFail'));
    }

    // Persist characters and collect IDs
    // DB rows (from wishedChars) already have an `id`; fresh fetches need upsert
    const chars = [];
    for (const raw of rawChars) {
      try {
        if (raw.id) {
          chars.push(raw);
        } else {
          const row = stmts.upsertChar.get(raw);
          chars.push({ ...raw, id: row.id });
        }
      } catch (e) {
        console.error('upsert error', e.message);
      }
    }

    if (!chars.length) {
      return interaction.editReply(t(guildId, 'roll.saveFail'));
    }

    const claimWindowSecs = settings.claim_window_minutes * 60;
    const expiresAt = now + claimWindowSecs;

    const roll = stmts.createRoll.run({
      guild_id: guildId,
      channel_id: interaction.channelId,
      user_id: userId,
      message_id: null,
      character_ids: JSON.stringify(chars.map(c => c.id)),
      expires_at: expiresAt,
    });
    const rollId = roll.lastInsertRowid;

    stmts.setCooldown.run(userId, guildId);

    const embeds     = buildRollEmbeds(chars);
    const components = buildClaimSelect(rollId, chars, undefined, guildId);
    const mins = settings.claim_window_minutes;

    const msg = await interaction.editReply({
      content: t(guildId, 'roll.rolled', { user: interaction.user.username, mins }),
      embeds,
      components,
    });

    stmts.setRollMessageId.run(msg.id, rollId);

    // DM wishlist watchers immediately when their char appears in a roll
    const jumpUrl = `https://discord.com/channels/${guildId}/${interaction.channelId}/${msg.id}`;
    for (const char of chars) {
      if (!char.id) continue;
      const watchers = stmts.getWishWatchers.all(guildId, char.id);
      for (const { user_id } of watchers) {
        if (user_id === userId) continue;
        try {
          const u = await interaction.client.users.fetch(user_id);
          await u.send(t(guildId, 'roll.wishlistPing', { char: char.name, guild: interaction.guild.name, url: jumpUrl, mins }));
        } catch {}
      }
    }

    // Disable buttons after window expires
    setTimeout(async () => {
      try {
        await msg.edit({
          content: t(guildId, 'roll.expired', { user: interaction.user.username }),
          embeds,
          components: [],
        });
      } catch {}
    }, claimWindowSecs * 1000);
  },
};
