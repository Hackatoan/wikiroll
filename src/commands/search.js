import { SlashCommandBuilder } from 'discord.js';
import { stmts } from '../database.js';
import { searchWikipedia, fetchWikiPage } from '../wiki.js';
import { buildSearchEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a character — see if they\'re claimed and by whom')
    .addStringOption(o =>
      o.setName('query').setDescription('Character or article name').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const query   = interaction.options.getString('query');
    const guildId = interaction.guildId;

    // Search local DB first
    let results = stmts.searchChars.all(guildId, `%${query}%`);

    // Supplement with Wikipedia if slim
    if (results.length < 3) {
      const titles = await searchWikipedia(query);
      for (const title of titles) {
        const alreadyHave = results.some(r => r.name.toLowerCase() === title.toLowerCase());
        if (alreadyHave) continue;
        const char = await fetchWikiPage(title);
        if (!char) continue;
        try {
          const row = stmts.upsertChar.get(char);
          const owner = stmts.getOwner.get(guildId, row.id);
          results.push({ ...char, id: row.id, owner_id: owner?.user_id ?? null });
        } catch {}
      }
    }

    await interaction.editReply({ embeds: [buildSearchEmbed(results, query)] });
  },
};
