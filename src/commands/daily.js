import { SlashCommandBuilder } from 'discord.js';
import { stmts, getSettings } from '../database.js';
import { fetchTenCharacters } from '../wiki.js';
import { buildRollEmbeds, buildClaimButtons } from '../embeds.js';

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Free daily roll! 2+ day streak earns a bonus claim.'),

  async execute(interaction) {
    await interaction.deferReply();

    const userId  = interaction.user.id;
    const guildId = interaction.guildId;
    const now     = Math.floor(Date.now() / 1000);
    const today   = todayUTC();
    const settings = getSettings(guildId);

    if (settings.roll_channel && interaction.channelId !== settings.roll_channel) {
      return interaction.editReply({
        content: `🗓️ Daily rolls are restricted to <#${settings.roll_channel}>.`,
        flags: 64,
      });
    }

    const dailyRec = stmts.getDaily.get(userId, guildId);

    if (dailyRec?.last_daily === today) {
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      const secsLeft = Math.ceil(tomorrow.getTime() / 1000 - now);
      const h = Math.floor(secsLeft / 3600);
      const m = Math.ceil((secsLeft % 3600) / 60);
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return interaction.editReply(`⏳ Already rolled today. Next daily in **${timeStr}**.`);
    }

    // Consecutive day streak (cap stored value at 100 to prevent overflow)
    const streak = dailyRec?.last_daily === yesterdayUTC()
      ? Math.min(dailyRec.streak + 1, 100)
      : 1;

    // 1 claim base, +1 bonus at streak >= 2, hard cap 2
    const claims = Math.min(streak >= 2 ? 2 : 1, 2);

    stmts.setDaily.run(userId, guildId, today, streak);

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
      channel_id: interaction.channelId,
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

    const msg = await interaction.editReply({
      content: `🗓️ **${interaction.user.username}'s daily roll!**\n${streakLine}Claim within **${mins} minute${mins !== 1 ? 's' : ''}**!`,
      embeds,
      components,
    });

    stmts.setRollMessageId.run(msg.id, rollId);

    setTimeout(async () => {
      try {
        await msg.edit({
          content: `🗓️ ~~${interaction.user.username}'s daily roll~~ *(expired)*`,
          embeds,
          components: [],
        });
      } catch {}
    }, claimWindowSecs * 1000);
  },
};
