import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote for WikiRoll on top.gg and earn a free bonus roll!'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const row = db.prepare('SELECT credits FROM vote_credits WHERE user_id = ?').get(userId);
    const credits = row?.credits ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0xff3366)
      .setTitle('🗳️ Vote for WikiRoll')
      .setDescription(
        'Voting takes 5 seconds and earns you a **free bonus roll** that bypasses your cooldown.'
      )
      .addFields(
        {
          name: '🔗 Vote Link',
          value: '[Vote on top.gg](https://top.gg/bot/1343100226537259018/vote)',
          inline: false,
        },
        {
          name: '🎲 Your Vote Credits',
          value: credits > 0
            ? `You have **${credits}** free roll${credits !== 1 ? 's' : ''} ready!\nJust use \`/roll\` — your credit is spent automatically.`
            : 'No credits yet. Vote above to earn one!',
          inline: false,
        },
        {
          name: 'ℹ️ How it works',
          value: '1. Click the vote link above\n2. Vote on top.gg (free, takes 5 sec)\n3. You\'ll get a DM confirmation + credit\n4. Your next `/roll` skips the cooldown',
          inline: false,
        }
      )
      .setFooter({ text: 'top.gg votes refresh every 12 hours' });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
