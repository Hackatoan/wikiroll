import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get help with WikiRoll — support server, docs, and links'),

  async execute(interaction) {
    const g = interaction.guildId;
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(t(g, 'support.title'))
      .setDescription(t(g, 'support.desc'))
      .addFields(
        { name: t(g, 'support.helpField'), value: t(g, 'support.helpV'), inline: false },
        { name: t(g, 'support.linksField'), value: t(g, 'support.linksV'), inline: false },
      )
      .setFooter({ text: t(g, 'support.footer') });

    await interaction.reply({ embeds: [embed] });
  },
};
