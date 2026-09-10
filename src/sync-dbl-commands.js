// Push WikiRoll's slash-command list to discordbotlist.com.
// DBL accepts "the same format sent to Discord", so we reuse the exact
// command builders from deploy-commands.js (options + descriptions intact).
//
//   DBL_API_TOKEN=<token from the bot's DBL edit page → API>  \
//   CLIENT_ID=1343100226537259018  node src/sync-dbl-commands.js
//
// The DBL *API token* is NOT the webhook secret — grab it from
// https://discordbotlist.com/bots/<id>/edit under the "API" section.
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token    = process.env.DBL_API_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('DBL_API_TOKEN and CLIENT_ID must be set');
  process.exit(1);
}

// Owner-only / hidden commands we don't advertise publicly.
const HIDDEN = new Set(['ghostroll', 'status']);

const commands = [];
for (const file of readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const mod  = await import(pathToFileURL(join(__dirname, 'commands', file)));
  const json = mod.default.data.toJSON();
  if (HIDDEN.has(json.name)) continue;
  commands.push(json);
}

console.log(`Submitting ${commands.length} commands to discordbotlist.com...`);
const res = await fetch(`https://discordbotlist.com/api/v1/bots/${clientId}/commands`, {
  method: 'POST',
  headers: {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
});

const text = await res.text();
if (!res.ok) {
  console.error(`❌ DBL responded ${res.status}: ${text}`);
  process.exit(1);
}
console.log(`✅ Submitted ${commands.length} commands. DBL: ${text || 'ok'}`);
