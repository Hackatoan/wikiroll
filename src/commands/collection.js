import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts } from '../database.js';
import { buildCollectionEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('View a character collection')
    .addUserOption(o => o.setName('user').setDescription('Whose collection to view (default: yours)'))
    .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const page   = interaction.options.getInteger('page') ?? 1;
    const chars  = stmts.getUserCollection.all(interaction.guildId, target.id);

    const perPage = 12;
    const totalPages = Math.max(1, Math.ceil(chars.length / perPage));
    const safePage = Math.min(page, totalPages);

    const embed = buildCollectionEmbed(target, chars, safePage);

    const rows = [];
    if (totalPages > 1) {
      const ar = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`col_${target.id}_${safePage - 1}`)
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 1),
        new ButtonBuilder()
          .setCustomId(`col_${target.id}_${safePage + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages)
      );
      rows.push(ar);
    }

    await interaction.reply({ embeds: [embed], components: rows });
  },
};
