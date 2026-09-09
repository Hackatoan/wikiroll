import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getShards } from '../database.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote for WikiRoll on top.gg and earn Shards!'),

  async execute(interaction) {
    const g = interaction.guildId;
    const balance = getShards(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0xff3366)
      .setTitle(t(g, 'vote.title'))
      .setDescription(t(g, 'vote.desc'))
      .addFields(
        { name: t(g, 'vote.linkField'), value: t(g, 'vote.linkV'), inline: false },
        { name: t(g, 'vote.creditsField'), value: t(g, 'vote.creditsHave', { n: balance }), inline: false },
        { name: t(g, 'vote.howField'), value: t(g, 'vote.howV'), inline: false },
      )
      .setFooter({ text: t(g, 'vote.footer') });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
