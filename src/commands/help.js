import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all WikiRoll commands'),

  async execute(interaction) {
    const g = interaction.guildId;
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(t(g, 'help.title'))
      .addFields(
        { name: t(g, 'help.rolling'), value: t(g, 'help.rollingV') },
        { name: t(g, 'help.collection'), value: t(g, 'help.collectionV') },
        { name: t(g, 'help.social'), value: t(g, 'help.socialV') },
        { name: t(g, 'help.setup'), value: t(g, 'help.setupV') },
        { name: t(g, 'help.other'), value: t(g, 'help.otherV') },
      )
      .setFooter({ text: 'wikiroll.hackatoa.com' });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
