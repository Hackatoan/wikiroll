// Per-guild fixed-string i18n for WikiRoll.
// t(guildId, key, params) resolves the guild's language (guild_settings.language),
// looks the key up in src/i18n/<locale>.json, falls back to English then the key,
// and interpolates {param} placeholders. Strings not yet in the catalogs simply
// render their English source, so localization can be filled in incrementally.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getGuildLanguage } from './database.js';

const DIR = dirname(fileURLToPath(import.meta.url));
export const LOCALES = ['en', 'es', 'pt-br', 'fr', 'de', 'vi', 'th'];
export const LANGS = {
  en: { label: 'English' },
  es: { label: 'Español' },
  'pt-br': { label: 'Português (BR)' },
  fr: { label: 'Français' },
  de: { label: 'Deutsch' },
  vi: { label: 'Tiếng Việt' },
  th: { label: 'ไทย' },
};

const CATALOGS = {};
for (const loc of LOCALES) {
  try { CATALOGS[loc] = JSON.parse(readFileSync(join(DIR, 'i18n', `${loc}.json`), 'utf8')); }
  catch { CATALOGS[loc] = {}; }
}

export function t(guildId, key, params) {
  const loc = getGuildLanguage(guildId);
  let s = (CATALOGS[loc] && CATALOGS[loc][key]) ?? (CATALOGS.en && CATALOGS.en[key]) ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(params[k]);
  return s;
}
