import { SlashCommandBuilder } from 'discord.js';
import { stmts } from '../database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove (divorce) a character from your collection')
    .addStringOption(o =>
      o.setName('name').setDescription('Character name').setRequired(true)
    ),

  async execute(interaction) {
    const query   = interaction.options.getString('name');
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;

    const results = stmts.searchChars.all(guildId, `%${query}%`);
    const owned   = results.filter(c => c.owner_id === userId);

    if (!owned.length) {
      return interaction.reply({
        content: `You don't own any character matching **"${query}"**.`,
        ephemeral: true,
      });
    }

    if (owned.length > 1) {
      const list = owned.slice(0, 8).map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return interaction.reply({
        content: `Multiple matches found — be more specific:\n${list}`,
        ephemeral: true,
      });
    }

    const char = owned[0];
    stmts.removeChar.run(guildId, userId, char.id);
    await interaction.reply({
      content: `💔 **${char.name}** has been removed from your collection.`,
    });
  },
};
