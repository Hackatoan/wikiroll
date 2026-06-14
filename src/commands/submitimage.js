import { SlashCommandBuilder } from 'discord.js';
import { stmts } from '../database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('submitimage')
    .setDescription('Set a custom image for a character using a URL (right-click → Copy Image Link in Discord)')
    .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
    .addStringOption(o => o.setName('url').setDescription('Direct image URL').setRequired(true)),

  async execute(interaction) {
    const name     = interaction.options.getString('name');
    const imageUrl = interaction.options.getString('url');

    try { new URL(imageUrl); } catch {
      return interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });
    }

    const results = stmts.searchChars.all(interaction.guildId, `%${name}%`);
    if (!results.length) {
      return interaction.reply({
        content: `Character **"${name}"** not found. Try \`/search\` first.`,
        ephemeral: true,
      });
    }

    const char = results[0];
    stmts.setUserImage.run(imageUrl, char.id);

    await interaction.reply({ content: `🖼️ Image updated for **${char.name}**!` });
  },
};
