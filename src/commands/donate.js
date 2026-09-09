import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Support WikiRoll — help keep the bot online'),

  async execute(interaction) {
    const g = interaction.guildId;
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(t(g, 'donate.title'))
      .setDescription(t(g, 'donate.desc'))
      .addFields(
        { name: t(g, 'donate.waysField'), value: t(g, 'donate.waysV'), inline: false },
      )
      .setFooter({ text: t(g, 'donate.footer') });

    await interaction.reply({ embeds: [embed] });
  },
};
