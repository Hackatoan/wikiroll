# WikiRoll

A Discord bot for collecting characters and articles from Wikipedia and 70+ Fandom wikis. Roll, claim, trade, and build your collection — one wiki page at a time.

**[🌐 Website](https://wikiroll.hackatoa.com) · [➕ Add to Discord](https://discord.com/api/oauth2/authorize?client_id=1343100226537259018&permissions=126016&scope=bot%20applications.commands) · [☕ Buy Me a Coffee](https://buymeacoffee.com/hackatoa)**

---

## Features

- **Roll** — 10 characters per roll from Wikipedia + 70 Fandom wikis (Naruto, Marvel, Harry Potter, Genshin, etc.)
- **Claim** — First to click within the 5-minute window owns the character. One owner per server.
- **Trade** — Offer trades with button-based accept/decline. 10-minute window.
- **Wishlist** — Add characters to get DM notifications when they appear in a roll.
- **Boost sources** — Wishlist a Fandom wiki or keyword for 3× roll weighting.
- **Search** — Find any character, see who owns them in your server.
- **Custom images** — Submit Discord CDN image URLs for any character.
- **Server settings** — Admins can configure roll cooldown, claim window, and custom wiki sources.
- **Prefix + slash commands** — Full slash command support + `w.` prefix commands.

## Commands

| Slash | Prefix | Description |
|---|---|---|
| `/roll` | `w.roll` | Roll 10 characters (default 1hr cooldown) |
| `/collection [@user]` | `w.c [@user]` | View collection (paginated) |
| `/search <query>` | `w.s <query>` | Search for a character |
| `/info <name>` | `w.info <name>` | Character detail card |
| `/trade @user <offer> <want>` | `w.trade @user <offer> <want>` | Offer a trade |
| `/remove <name>` | `w.remove <name>` | Remove from collection |
| `/wishlist add <name>` | `w.wl add <name>` | Add to wishlist |
| `/wishlist addsource <url\|keyword>` | `w.wl addsource <url\|keyword>` | Boost a source 3× |
| `/wishlist view` | `w.wl view` | View wishlist |
| `/wishlist sources` | `w.wl sources` | View boosted sources |
| `/submitimage <name> <url>` | — | Set custom image via URL |
| `/source add <url>` | — | Add Fandom wiki (Manage Server) |
| `/settings` | — | Configure bot (Manage Server) |
| `/help` | `w.help` | Command reference |

## Built-in Fandom Wikis (70+)

Naruto, One Piece, Dragon Ball, Bleach, Fairy Tail, Attack on Titan, My Hero Academia, Hunter x Hunter, Fullmetal Alchemist, Tokyo Ghoul, Sword Art Online, Re:Zero, One Punch Man, Demon Slayer, Jujutsu Kaisen, Black Clover, Haikyuu, Boruto, League of Legends, Final Fantasy, Elder Scrolls, Fallout, Mass Effect, Genshin Impact, Dark Souls, Undertale, Fire Emblem, Persona, Street Fighter, Mortal Kombat, Overwatch, Minecraft, Stardew Valley, Dragon Age, Borderlands, DC Comics, Marvel, Avatar, Steven Universe, Gravity Falls, Adventure Time, My Little Pony, RWBY, The Owl House, Ben 10, Teen Titans, Harry Potter, Star Wars, Game of Thrones, LOTR, Star Trek, The Witcher, Percy Jackson, Warrior Cats, Warhammer 40K, D&D, Transformers, and more.

## Self-Hosting

```bash
git clone https://github.com/Hackatoan/wikiroll
cd wikiroll
cp .env.example .env
# Fill in .env with your BOT_TOKEN and CLIENT_ID
docker compose up -d
```

Requires Docker. Data is persisted in a named volume (`wikiroll-data`). SQLite database at `/data/wikiroll.db`.

> **Note:** You must enable the **Message Content** privileged intent in the [Discord Developer Portal](https://discord.com/developers/applications) for prefix commands (`w.`) to work.

## Stack

- [discord.js](https://discord.js.org/) v14
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [axios](https://axios-http.com/)
- Wikipedia REST API + MediaWiki Action API
- Fandom MediaWiki APIs

---

A project by [Hackatoa](https://hackatoa.com) · [☕ Support](https://buymeacoffee.com/hackatoa)
