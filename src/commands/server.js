import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Join the Orbital Outpost — the official WikiRoll community Discord'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(t(interaction.guildId, 'server.title'))
      .setDescription(
        t(interaction.guildId, 'server.desc')
      )
      .addFields({
        name: t(interaction.guildId, 'server.inviteField'),
        value: '[discord.gg/7eh3q2u8V](https://discord.gg/7eh3q2u8V)',
        inline: false,
      })
      .setFooter({ text: t(interaction.guildId, 'server.footer') });

    await interaction.reply({ embeds: [embed] });
  },
};
