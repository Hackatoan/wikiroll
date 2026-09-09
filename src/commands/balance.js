import { SlashCommandBuilder } from 'discord.js';
import { getShards } from '../database.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your 💠 Shard balance'),

  async execute(interaction) {
    await interaction.reply({
      content: t(interaction.guildId, 'balance.line', { bal: getShards(interaction.user.id) }),
      flags: 64,
    });
  },
};
