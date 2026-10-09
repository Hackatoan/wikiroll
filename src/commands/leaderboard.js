import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLinkedGuildIds, getLeaderboardCrossGuild, getUserTotalCrossGuild } from '../database.js';
import { t } from '../i18n.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top collectors in this server — ranked by collection size'),

  async execute(interaction) {
    const guildId      = interaction.guildId;
    const linkedGuilds = getLinkedGuildIds(guildId);

    const rows = getLeaderboardCrossGuild(linkedGuilds, 10);

    if (!rows.length) {
      return interaction.reply({
        content: t(interaction.guildId, 'lb.empty'),
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    // Batch-fetch guild members and users (reduce API calls from N to ~2)
    const userIds = rows.map(r => r.user_id);
    const memberCache = new Map();

    // Fetch all members at once
    await interaction.guild.members.fetch({ user: userIds }).then(members => {
      members.forEach(m => memberCache.set(m.id, m.displayName));
    }).catch(() => {});

    // For members not in guild, fetch users concurrently
    const notInGuild = userIds.filter(id => !memberCache.has(id));
    if (notInGuild.length > 0) {
      await Promise.allSettled(
        notInGuild.map(id =>
          interaction.client.users.fetch(id).then(u => memberCache.set(id, u.username))
        )
      );
    }

    // Build lines with cached names
    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      const { user_id, total } = rows[i];
      const medal = MEDALS[i] ?? `**${i + 1}.**`;
      const name = memberCache.get(user_id) ?? `<@${user_id}>`;
      const highlight = user_id === interaction.user.id ? t(interaction.guildId, 'lb.you') : '';
      lines.push(t(interaction.guildId, 'lb.entry', { medal, name, total, you: highlight }));
    }

    // Find the caller's rank if they're not in top 10
    let footerText = t(interaction.guildId, 'lb.footerTotal', { total: rows.reduce((sum, r) => sum + r.total, 0) });
    const callerInTop = rows.some(r => r.user_id === interaction.user.id);
    if (!callerInTop) {
      const callerTotal = getUserTotalCrossGuild(linkedGuilds, interaction.user.id);
      if (callerTotal > 0) {
        const everyone = getLeaderboardCrossGuild(linkedGuilds, 1_000_000);
        const rank = everyone.filter(r => r.total >= callerTotal).length;
        footerText += t(interaction.guildId, 'lb.footerRank', { rank, n: callerTotal });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(t(interaction.guildId, 'lb.title', { guild: interaction.guild.name }))
      .setDescription(lines.join('\n'))
      .setFooter({ text: footerText })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
