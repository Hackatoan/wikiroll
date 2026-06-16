import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote for WikiRoll on top.gg!'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xff3366)
      .setTitle('🗳️ Vote for WikiRoll')
      .setDescription(
        'Voting helps WikiRoll grow and reach more servers. It takes 5 seconds and is completely free!'
      )
      .addFields(
        {
          name: '🔗 Vote Link',
          value: '[Vote on top.gg](https://top.gg/bot/1343100226537259018/vote)',
          inline: false,
        }
      )
      .setFooter({ text: 'top.gg votes refresh every 12 hours' });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
