import { SlashCommandBuilder } from 'discord.js';
import { stmts } from '../database.js';
import { t } from '../i18n.js';

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
        content: t(guildId, 'remove.noOwn', { q: query }),
        ephemeral: true,
      });
    }

    if (owned.length > 1) {
      const list = owned.slice(0, 8).map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return interaction.reply({
        content: t(guildId, 'remove.multiple', { list }),
        ephemeral: true,
      });
    }

    const char = owned[0];
    stmts.removeChar.run(guildId, userId, char.id);
    await interaction.reply({
      content: t(guildId, 'remove.removed', { char: char.name }),
    });
  },
};
