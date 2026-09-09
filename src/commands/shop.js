import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getShards } from '../database.js';
import { t } from '../i18n.js';

// Single source of truth for shop pricing (also read by the button handler).
export const SHOP_ITEMS = {
  extraroll: { cost: 20 },
};

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Spend your Shards 💠 — earned from voting and daily rolls'),

  async execute(interaction) {
    const g = interaction.guildId;
    const balance = getShards(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(t(g, 'shop.title'))
      .setDescription(t(g, 'shop.desc', { bal: balance }))
      .addFields(
        { name: t(g, 'shop.extraroll'), value: t(g, 'shop.extrarollV', { cost: SHOP_ITEMS.extraroll.cost }), inline: false },
        { name: t(g, 'shop.soon'),      value: t(g, 'shop.soonV'), inline: false },
      )
      .setFooter({ text: t(g, 'shop.footer') });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_buy_extraroll_${interaction.user.id}`)
        .setLabel(t(g, 'shop.buyExtraroll', { cost: SHOP_ITEMS.extraroll.cost }))
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Success)
        .setDisabled(balance < SHOP_ITEMS.extraroll.cost),
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  },
};
