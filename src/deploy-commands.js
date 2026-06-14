import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const token    = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('BOT_TOKEN and CLIENT_ID must be set');
  process.exit(1);
}

const commands = [];
for (const file of readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(join(__dirname, 'commands', file)));
  commands.push(mod.default.data.toJSON());
}

const rest = new REST().setToken(token);
console.log(`Registering ${commands.length} slash commands...`);
await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log('✅ Slash commands registered globally.');
