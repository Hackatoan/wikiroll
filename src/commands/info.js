import { SlashCommandBuilder } from 'discord.js';
import { stmts, getLinkedGuildIds, getOwnerCrossGuild } from '../database.js';
import { buildCharInfoEmbed, nameChoices } from '../embeds.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View detailed info about a character in the database')
    .addStringOption(o =>
      o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const q = interaction.options.getFocused();
    await interaction.respond(nameChoices(stmts.searchChars.all(interaction.guildId, `%${q}%`)));
  },

  async execute(interaction) {
    const name    = interaction.options.getString('name');
    const guildId = interaction.guildId;

    const results = stmts.searchChars.all(guildId, `%${name}%`);
    if (!results.length) {
      return interaction.reply({ content: t(guildId, 'info.notFound', { name }), ephemeral: true });
    }

    // Prefer an exact name match (what autocomplete submits) over the first LIKE hit
    const char  = results.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? results[0];
    const owner = getOwnerCrossGuild(getLinkedGuildIds(guildId), char.id);
    await interaction.reply({ embeds: [buildCharInfoEmbed(char, owner?.user_id ?? null, guildId)] });
  },
};
