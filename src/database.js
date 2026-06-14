import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';

mkdirSync('/data', { recursive: true });
export const db = new Database('/data/wikiroll.db');

// Called at module load so tables exist before stmts are prepared
function initDatabase() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      wiki_url TEXT,
      page_id TEXT,
      source TEXT DEFAULT 'wikipedia',
      image_url TEXT,
      user_image TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chars_source ON characters(source, page_id);

    CREATE TABLE IF NOT EXISTS ownership (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      character_id INTEGER NOT NULL REFERENCES characters(id),
      claimed_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(guild_id, character_id)
    );
    CREATE INDEX IF NOT EXISTS idx_own_user ON ownership(guild_id, user_id);

    CREATE TABLE IF NOT EXISTS rolls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT,
      character_ids TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      last_roll INTEGER NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      character_id INTEGER REFERENCES characters(id),
      character_name TEXT,
      UNIQUE(user_id, guild_id, character_id)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      initiator_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      initiator_char_id INTEGER REFERENCES characters(id),
      target_char_id INTEGER REFERENCES characters(id),
      message_id TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wiki_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      wiki_url TEXT NOT NULL,
      wiki_name TEXT,
      added_by TEXT,
      UNIQUE(guild_id, wiki_url)
    );

    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      roll_cooldown_minutes INTEGER DEFAULT 60,
      claim_window_minutes INTEGER DEFAULT 5,
      notify_channel TEXT
    );

    CREATE TABLE IF NOT EXISTS wishlist_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      source_type TEXT NOT NULL, -- 'fandom' or 'search'
      source_value TEXT NOT NULL,
      display_name TEXT,
      UNIQUE(user_id, guild_id, source_type, source_value)
    );
  `);
}

// Run immediately so tables exist before stmts are prepared below
initDatabase();

// Export for callers that just want to re-init (no-op since tables already exist)
export { initDatabase };

// ── Characters ──────────────────────────────────────────────────────────────

export const stmts = {
  upsertChar: db.prepare(`
    INSERT INTO characters (name, description, wiki_url, page_id, source, image_url)
    VALUES (@name, @description, @wiki_url, @page_id, @source, @image_url)
    ON CONFLICT(source, page_id) DO UPDATE SET
      name        = excluded.name,
      description = COALESCE(excluded.description, characters.description),
      image_url   = COALESCE(excluded.image_url, characters.image_url)
    RETURNING id
  `),

  getChar: db.prepare(`SELECT * FROM characters WHERE id = ?`),

  searchChars: db.prepare(`
    SELECT c.*, o.user_id AS owner_id
    FROM characters c
    LEFT JOIN ownership o ON o.character_id = c.id AND o.guild_id = ?
    WHERE c.name LIKE ?
    LIMIT 20
  `),

  setUserImage: db.prepare(`UPDATE characters SET user_image = ? WHERE id = ?`),

  // ── Ownership ──────────────────────────────────────────────────────────────

  claim: db.prepare(`
    INSERT OR IGNORE INTO ownership (guild_id, user_id, character_id)
    VALUES (?, ?, ?)
  `),

  getOwner: db.prepare(`SELECT * FROM ownership WHERE guild_id = ? AND character_id = ?`),

  getUserCollection: db.prepare(`
    SELECT c.*, o.claimed_at FROM characters c
    JOIN ownership o ON o.character_id = c.id
    WHERE o.guild_id = ? AND o.user_id = ?
    ORDER BY o.claimed_at DESC
  `),

  removeChar: db.prepare(`
    DELETE FROM ownership WHERE guild_id = ? AND user_id = ? AND character_id = ?
  `),

  transferChar: db.prepare(`
    UPDATE ownership SET user_id = ?
    WHERE guild_id = ? AND character_id = ? AND user_id = ?
  `),

  // ── Rolls ──────────────────────────────────────────────────────────────────

  createRoll: db.prepare(`
    INSERT INTO rolls (guild_id, channel_id, user_id, message_id, character_ids, expires_at)
    VALUES (@guild_id, @channel_id, @user_id, @message_id, @character_ids, @expires_at)
  `),

  setRollMessageId: db.prepare(`UPDATE rolls SET message_id = ? WHERE id = ?`),

  getRoll: db.prepare(`SELECT * FROM rolls WHERE id = ?`),

  getActiveRollByUser: db.prepare(`
    SELECT * FROM rolls
    WHERE guild_id = ? AND user_id = ? AND expires_at > unixepoch()
    ORDER BY created_at DESC LIMIT 1
  `),

  // ── Cooldowns ──────────────────────────────────────────────────────────────

  getCooldown: db.prepare(`SELECT last_roll FROM cooldowns WHERE user_id = ? AND guild_id = ?`),
  setCooldown: db.prepare(`
    INSERT OR REPLACE INTO cooldowns (user_id, guild_id, last_roll)
    VALUES (?, ?, unixepoch())
  `),

  // ── Wishlists ─────────────────────────────────────────────────────────────

  addWish: db.prepare(`
    INSERT OR IGNORE INTO wishlists (user_id, guild_id, character_id, character_name)
    VALUES (?, ?, ?, ?)
  `),
  removeWish: db.prepare(`DELETE FROM wishlists WHERE user_id = ? AND guild_id = ? AND character_id = ?`),
  getUserWishlist: db.prepare(`
    SELECT w.*, COALESCE(c.name, w.character_name) AS display_name
    FROM wishlists w LEFT JOIN characters c ON c.id = w.character_id
    WHERE w.user_id = ? AND w.guild_id = ?
  `),
  getWishWatchers: db.prepare(`SELECT user_id FROM wishlists WHERE guild_id = ? AND character_id = ?`),

  // ── Trades ────────────────────────────────────────────────────────────────

  createTrade: db.prepare(`
    INSERT INTO trades (guild_id, initiator_id, target_id, initiator_char_id, target_char_id, message_id, expires_at)
    VALUES (@guild_id, @initiator_id, @target_id, @initiator_char_id, @target_char_id, @message_id, @expires_at)
  `),
  setTradeMessageId: db.prepare(`UPDATE trades SET message_id = ? WHERE id = ?`),
  getTrade: db.prepare(`SELECT * FROM trades WHERE id = ? AND status = 'pending'`),
  setTradeStatus: db.prepare(`UPDATE trades SET status = ? WHERE id = ?`),

  // ── Wiki sources ──────────────────────────────────────────────────────────

  addSource: db.prepare(`INSERT OR IGNORE INTO wiki_sources (guild_id, wiki_url, wiki_name, added_by) VALUES (?, ?, ?, ?)`),
  removeSource: db.prepare(`DELETE FROM wiki_sources WHERE guild_id = ? AND wiki_url = ?`),
  getSources: db.prepare(`SELECT * FROM wiki_sources WHERE guild_id = ?`),

  // ── Wishlist sources ──────────────────────────────────────────────────────

  addWishSource: db.prepare(`
    INSERT OR IGNORE INTO wishlist_sources (user_id, guild_id, source_type, source_value, display_name)
    VALUES (?, ?, ?, ?, ?)
  `),
  removeWishSource: db.prepare(`
    DELETE FROM wishlist_sources WHERE user_id = ? AND guild_id = ? AND source_value = ?
  `),
  getUserWishSources: db.prepare(`SELECT * FROM wishlist_sources WHERE user_id = ? AND guild_id = ?`),
  getGuildWishSources: db.prepare(`SELECT DISTINCT source_type, source_value FROM wishlist_sources WHERE guild_id = ?`),
  getGuildWishChars: db.prepare(`
    SELECT DISTINCT c.* FROM wishlists w
    JOIN characters c ON c.id = w.character_id
    WHERE w.guild_id = ?
    ORDER BY RANDOM()
    LIMIT 20
  `),

  // ── Settings ──────────────────────────────────────────────────────────────

  getSettings: db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`),
  upsertSettings: db.prepare(`
    INSERT INTO guild_settings (guild_id, roll_cooldown_minutes, claim_window_minutes, notify_channel)
    VALUES (@guild_id, @roll_cooldown_minutes, @claim_window_minutes, @notify_channel)
    ON CONFLICT(guild_id) DO UPDATE SET
      roll_cooldown_minutes = COALESCE(@roll_cooldown_minutes, guild_settings.roll_cooldown_minutes),
      claim_window_minutes  = COALESCE(@claim_window_minutes,  guild_settings.claim_window_minutes),
      notify_channel        = COALESCE(@notify_channel,        guild_settings.notify_channel)
  `),
};

export function getCharsByIds(ids) {
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM characters WHERE id IN (${ph})`).all(...ids);
}

export function getSettings(guildId) {
  return stmts.getSettings.get(guildId) ?? {
    guild_id: guildId,
    roll_cooldown_minutes: 60,
    claim_window_minutes: 5,
    notify_channel: null,
  };
}
