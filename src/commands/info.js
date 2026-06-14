import { SlashCommandBuilder } from 'discord.js';
import { stmts } from '../database.js';
import { buildCharInfoEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View detailed info about a character in the database')
    .addStringOption(o =>
      o.setName('name').setDescription('Character name').setRequired(true)
    ),

  async execute(interaction) {
    const name    = interaction.options.getString('name');
    const guildId = interaction.guildId;

    const results = stmts.searchChars.all(guildId, `%${name}%`);
    if (!results.length) {
      return interaction.reply({ content: `No character matching **"${name}"** found. Try \`/search\` first.`, ephemeral: true });
    }

    const char  = results[0];
    const owner = stmts.getOwner.get(guildId, char.id);
    await interaction.reply({ embeds: [buildCharInfoEmbed(char, owner?.user_id ?? null)] });
  },
};
