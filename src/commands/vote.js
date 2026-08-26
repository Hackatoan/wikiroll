import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote for WikiRoll on top.gg and earn a free bonus roll!'),

  async execute(interaction) {
    const g = interaction.guildId;
    const userId = interaction.user.id;
    const row = db.prepare('SELECT credits FROM vote_credits WHERE user_id = ?').get(userId);
    const credits = row?.credits ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0xff3366)
      .setTitle(t(g, 'vote.title'))
      .setDescription(t(g, 'vote.desc'))
      .addFields(
        { name: t(g, 'vote.linkField'), value: t(g, 'vote.linkV'), inline: false },
        {
          name: t(g, 'vote.creditsField'),
          value: credits > 0 ? t(g, 'vote.creditsHave', { n: credits }) : t(g, 'vote.creditsNone'),
          inline: false,
        },
        { name: t(g, 'vote.howField'), value: t(g, 'vote.howV'), inline: false },
      )
      .setFooter({ text: t(g, 'vote.footer') });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
