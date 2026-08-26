import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('About WikiRoll — info, links, and stats'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const g = guildId;

    const totalChars   = db.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
    const guildOwned   = db.prepare('SELECT COUNT(*) AS n FROM ownership WHERE guild_id = ?').get(guildId).n;
    const guildRollers = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM ownership WHERE guild_id = ?').get(guildId).n;

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('WikiRoll')
      .setDescription(t(g, 'about.desc'))
      .addFields(
        {
          name: t(g, 'about.stats'),
          value: t(g, 'about.statsV', {
            total: totalChars.toLocaleString(),
            owned: guildOwned.toLocaleString(),
            rollers: guildRollers.toLocaleString(),
          }),
          inline: false,
        },
        { name: t(g, 'about.links'), value: t(g, 'about.linksV'), inline: false },
        { name: t(g, 'about.quickStart'), value: t(g, 'about.quickStartV'), inline: false },
        { name: t(g, 'about.admin'), value: t(g, 'about.adminV'), inline: false },
      )
      .setFooter({ text: t(g, 'about.footer') })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
