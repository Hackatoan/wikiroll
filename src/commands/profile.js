import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import {
  stmts, getSettings, getLinkedGuildIds,
  getUserCollectionCrossGuild, getUserRankCrossGuild,
} from '../database.js';
import { t } from '../i18n.js';

const dayInTz = (tz, offsetMs = 0) =>
  new Date(Date.now() - offsetMs).toLocaleDateString('en-CA', { timeZone: tz });

// A streak only counts as "live" if the last /daily was today or yesterday
// (in the guild's timezone) — mirrors the reset logic in commands/daily.js.
function liveStreak(userId, guildId) {
  const rec = stmts.getDaily.get(userId, guildId);
  if (!rec) return 0;
  const tz = getSettings(guildId).timezone;
  return rec.last_daily === dayInTz(tz) || rec.last_daily === dayInTz(tz, 864e5) ? rec.streak : 0;
}

// Read-only collector card built from existing tables — no writes, no schema changes.
export function buildProfileEmbed(user, guildId) {
  const g      = guildId;
  const linked = getLinkedGuildIds(guildId);
  const chars  = getUserCollectionCrossGuild(linked, user.id);
  const total  = chars.length;

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setAuthor({ name: t(g, 'profile.title', { user: user.username }), iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL());

  if (!total) return embed.setDescription(t(g, 'profile.empty'));

  const counts = new Map();
  for (const c of chars) counts.set(c.source || 'wikipedia', (counts.get(c.source || 'wikipedia') ?? 0) + 1);
  const topSources = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([src, n]) => `${src} (${n})`)
    .join('\n');

  const latest = chars[0]; // collection is ordered by claimed_at DESC
  const latestStr = latest.wiki_url ? `[${latest.name}](${latest.wiki_url})` : latest.name;
  const streak = liveStreak(user.id, guildId);

  embed.addFields(
    { name: t(g, 'profile.characters'), value: String(total), inline: true },
    { name: t(g, 'profile.rank'), value: `#${getUserRankCrossGuild(linked, total)}`, inline: true },
    { name: t(g, 'profile.streak'), value: t(g, 'profile.streakValue', { n: streak }), inline: true },
    { name: t(g, 'profile.topSources'), value: topSources, inline: true },
    { name: t(g, 'profile.latest'), value: latestStr, inline: true },
  );

  const img = latest.user_image || latest.image_url;
  if (img) embed.setThumbnail(img);
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Collector card: total characters, rank, top sources, daily streak')
    .addUserOption(o => o.setName('user').setDescription('Whose profile to view (default: yours)')),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    await interaction.reply({ embeds: [buildProfileEmbed(target, interaction.guildId)] });
  },
};
