import { SlashCommandBuilder } from 'discord.js';
import { stmts, getSettings } from '../database.js';
import { fetchTenCharacters } from '../wiki.js';
import { buildRollEmbeds, buildClaimButtons } from '../embeds.js';

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

    const cd = stmts.getCooldown.get(userId, guildId);
    if (cd) {
      const remaining = cooldownSecs - (now - cd.last_roll);
      if (remaining > 0) {
        const mins = Math.ceil(remaining / 60);
        return interaction.editReply(
          `⏳ You can roll again in **${mins} minute${mins !== 1 ? 's' : ''}**.`
        );
      }
    }

    const guildSources  = stmts.getSources.all(guildId).map(s => s.wiki_url);
    const wishedChars   = stmts.getGuildWishChars.all(guildId);
    const wishedSources = stmts.getGuildWishSources.all(guildId);

    const rawChars = await fetchTenCharacters({ guildSources, wishedChars, wishedSources });

    if (!rawChars.length) {
      return interaction.editReply('❌ Failed to fetch characters. Please try again in a moment.');
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
      return interaction.editReply('❌ Failed to save characters. Please try again.');
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
    const components = buildClaimButtons(rollId, chars.length);
    const mins = settings.claim_window_minutes;

    const msg = await interaction.editReply({
      content: `🎲 **${interaction.user.username}** rolled! Claim within **${mins} minute${mins !== 1 ? 's' : ''}**!`,
      embeds,
      components,
    });

    stmts.setRollMessageId.run(msg.id, rollId);

    // Disable buttons after window expires
    setTimeout(async () => {
      try {
        await msg.edit({
          content: `🎲 ~~${interaction.user.username}'s roll~~ *(expired)*`,
          embeds,
          components: [],
        });
      } catch {}
    }, claimWindowSecs * 1000);
  },
};
