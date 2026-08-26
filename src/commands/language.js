import { SlashCommandBuilder } from 'discord.js';
import { setGuildLanguage } from '../database.js';
import { LANGS, t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Set the language WikiRoll replies in for this server')
    .addStringOption((o) =>
      o
        .setName('language')
        .setDescription('Language WikiRoll will reply in')
        .setRequired(true)
        .addChoices(...Object.entries(LANGS).map(([value, { label }]) => ({ name: label, value })))
    ),

  async execute(interaction) {
    const code = interaction.options.getString('language');
    setGuildLanguage(interaction.guildId, code);
    await interaction.reply(t(interaction.guildId, 'language.set', { label: LANGS[code].label }));
  },
};
