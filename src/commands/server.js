import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Join the Orbital Outpost — the official WikiRoll community Discord'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('🚀 Orbital Outpost')
      .setDescription(
        'The official community server for WikiRoll and all things Hackatoa.\n\n' +
        'Hang out, share your collection, report bugs, suggest features, and chat with the dev.'
      )
      .addFields({
        name: '🔗 Invite Link',
        value: '[discord.gg/7eh3q2u8V](https://discord.gg/7eh3q2u8V)',
        inline: false,
      })
      .setFooter({ text: 'Homelab talk · dev projects · gaming · vibes' });

    await interaction.reply({ embeds: [embed] });
  },
};
