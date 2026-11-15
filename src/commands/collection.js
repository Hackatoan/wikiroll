import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getLinkedGuildIds, getUserCollectionCrossGuild } from '../database.js';
import { buildCollectionEmbed, sortCollection, collectionPageId } from '../embeds.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('View a character collection')
    .addUserOption(o => o.setName('user').setDescription('Whose collection to view (default: yours)'))
    .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))
    .addStringOption(o => o.setName('sort').setDescription('Sort order (default: newest first)').addChoices(
      { name: 'Newest first', value: 'n' },
      { name: 'Oldest first', value: 'o' },
      { name: 'Name (A–Z)', value: 'a' },
      { name: 'Source wiki', value: 's' },
    )),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const page   = interaction.options.getInteger('page') ?? 1;
    const sort   = interaction.options.getString('sort') ?? 'n';
    const chars  = sortCollection(getUserCollectionCrossGuild(getLinkedGuildIds(interaction.guildId), target.id), sort);

    const perPage = 12;
    const totalPages = Math.max(1, Math.ceil(chars.length / perPage));
    const safePage = Math.min(page, totalPages);

    const embed = buildCollectionEmbed(target, chars, safePage, interaction.guildId);

    const rows = [];
    if (totalPages > 1) {
      const ar = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(collectionPageId(target.id, safePage - 1, sort))
          .setLabel(t(interaction.guildId, 'btn.prev'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 1),
        new ButtonBuilder()
          .setCustomId(collectionPageId(target.id, safePage + 1, sort))
          .setLabel(t(interaction.guildId, 'btn.next'))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages)
      );
      rows.push(ar);
    }

    await interaction.reply({ embeds: [embed], components: rows });
  },
};
