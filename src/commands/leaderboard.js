import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top collectors in this server — ranked by collection size'),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS total
      FROM ownership
      WHERE guild_id = ?
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT 10
    `).all(guildId);

    if (!rows.length) {
      return interaction.reply({
        content: '📭 No one has claimed anything yet — use `/roll` to get started!',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    // Fetch Discord usernames
    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      const { user_id, total } = rows[i];
      const medal = MEDALS[i] ?? `**${i + 1}.**`;
      let name;
      try {
        const member = await interaction.guild.members.fetch(user_id);
        name = member.displayName;
      } catch {
        try {
          const user = await interaction.client.users.fetch(user_id);
          name = user.username;
        } catch {
          name = `<@${user_id}>`;
        }
      }
      const highlight = user_id === interaction.user.id ? ' ← you' : '';
      lines.push(`${medal} **${name}** — ${total} character${total !== 1 ? 's' : ''}${highlight}`);
    }

    // Find the caller's rank if they're not in top 10
    let footerText = `${rows.reduce((sum, r) => sum + r.total, 0)} characters claimed total`;
    const callerInTop = rows.some(r => r.user_id === interaction.user.id);
    if (!callerInTop) {
      const callerRow = db.prepare(`
        SELECT COUNT(*) AS total FROM ownership WHERE guild_id = ? AND user_id = ?
      `).get(guildId, interaction.user.id);
      if (callerRow?.total > 0) {
        const rank = db.prepare(`
          SELECT COUNT(DISTINCT user_id) AS r FROM ownership
          WHERE guild_id = ? AND user_id IN (
            SELECT user_id FROM ownership WHERE guild_id = ?
            GROUP BY user_id HAVING COUNT(*) >= ?
          )
        `).get(guildId, guildId, callerRow.total);
        footerText += ` · You're #${rank?.r ?? '?'} with ${callerRow.total}`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`🏆 ${interaction.guild.name} — Top Collectors`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: footerText })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
