# WikiRoll

A Discord bot for collecting characters and articles from Wikipedia and 150+ wikis. Roll, claim, trade, and build your collection — one wiki page at a time.

**[🌐 Website](https://wikiroll.hackatoa.com) · [➕ Add to Discord](https://discord.com/api/oauth2/authorize?client_id=1343100226537259018&permissions=19456&scope=bot%20applications.commands) · [🗳️ Vote on top.gg](https://top.gg/bot/1343100226537259018/vote) · [🚀 Community](https://discord.gg/7eh3q2u8V)**

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/hackatoa)

---

## Features

- **Roll** — 10 characters per roll from Wikipedia + 150+ wikis (Fandom, wiki.gg, runescape.wiki, minecraft.wiki, and more)
- **Claim** — First to click within the 5-minute window owns the character. One owner per server.
- **Trade** — Offer trades with button-based accept/decline. 10-minute window.
- **Leaderboard** — See the top collectors in your server ranked by collection size.
- **Wishlist** — Add characters to get DM notifications when they appear in a roll.
- **Boost sources** — Wishlist a Fandom wiki or keyword for 3× roll weighting.
- **Search** — Find any character, see who owns them in your server.
- **Custom images** — Submit Discord CDN image URLs for any character.
- **Server settings** — Admins can configure roll cooldown, claim window, and custom wiki sources.
- **Vote rewards** — Vote on top.gg every 12 hours to earn a free bonus roll (bypasses cooldown).
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
| `/leaderboard` | `w.lb` | Top collectors in the server |
| `/wishlist add <name>` | `w.wl add <name>` | Add to wishlist |
| `/wishlist addsource <url\|keyword>` | `w.wl addsource <url\|keyword>` | Boost a source 3× |
| `/wishlist remove <name>` | `w.wl rm <name>` | Remove from wishlist |
| `/wishlist view` | `w.wl view` | View wishlisted characters |
| `/wishlist sources` | `w.wl sources` | View boosted sources |
| `/submitimage <name> <url>` | `w.img <name> <url>` | Set custom image via URL |
| `/vote` | `w.vote` | Check vote credits + top.gg link |
| `/server` | `w.server` | Join the Orbital Outpost community server |
| `/about` | `w.help` | Bot info, stats, and links |
| `/source add <url>` | — | Add wiki source (Manage Server) |
| `/settings` | — | Configure bot (Manage Server) |
| `/setrollchannel set` | — | Restrict rolls to one channel (Manage Server) |
| `/linkserver start` | — | Share claimed ownership with another server (Manage Server) |

## Vote for Free Rolls

Voting for WikiRoll on [top.gg](https://top.gg/bot/1343100226537259018/vote) takes 5 seconds and earns a bonus roll credit that bypasses your hourly cooldown. Votes refresh every 12 hours. Use `/vote` in Discord to check your credit balance.

## Built-in Wiki Sources (150+)

**Anime / Manga** — Naruto, One Piece, Dragon Ball, Bleach, Fairy Tail, Attack on Titan, My Hero Academia, Hunter x Hunter, Fullmetal Alchemist, Tokyo Ghoul, SAO, Re:Zero, One Punch Man, Demon Slayer, Jujutsu Kaisen, Black Clover, Haikyuu, Chainsaw Man, Tokyo Revengers, Overlord, Konosuba, Death Note, Code Geass, Gurren Lagann, Evangelion, JoJo's Bizarre Adventure, Berserk, Spy x Family, and more.

**Video Games** — League of Legends, Final Fantasy, Elder Scrolls, Fallout, Mass Effect, Genshin Impact, Dark Souls, Undertale, Fire Emblem, Persona, Pokémon, Zelda, Mario, Kirby, Sonic, Hollow Knight, Terraria, Elden Ring, God of War, Halo, Destiny, Warframe, Monster Hunter, Metroid, Animal Crossing, Splatoon, NieR, Devil May Cry, Kingdom Hearts, Tekken, Apex Legends, Valorant, Fortnite, Cyberpunk 2077, Dota 2, Hearthstone, StarCraft, BioShock, Resident Evil, Silent Hill, Assassin's Creed, Call of Duty, Battlefield, Red Dead, Dragon Age, Borderlands, and more.

**Standalone wikis** — [minecraft.wiki](https://minecraft.wiki), [runescape.wiki](https://runescape.wiki), [oldschool.runescape.wiki](https://oldschool.runescape.wiki), [terraria.wiki.gg](https://terraria.wiki.gg), [wiki.guildwars2.com](https://wiki.guildwars2.com)

**Western Animation / Comics** — DC, Marvel, Avatar, Steven Universe, Gravity Falls, Adventure Time, MLP, RWBY, The Owl House, Ben 10, Teen Titans, Invincible, The Boys, Arcane, The Dragon Prince, She-Ra, and more.

**TV / Movies / Books** — Harry Potter, Star Wars, Game of Thrones, LOTR, Star Trek, The Witcher, Percy Jackson, Warrior Cats, Warhammer 40K, D&D, Transformers, Doctor Who, Supernatural, The Walking Dead, Rick and Morty, The Simpsons, South Park, Hunger Games, Futurama, Family Guy, Sandman, and more.

## Self-Hosting

```bash
git clone https://github.com/Hackatoan/wikiroll
cd wikiroll
cp .env.example .env
# Fill in BOT_TOKEN, CLIENT_ID, and optionally TOPGG_WEBHOOK_SECRET
docker compose up -d
```

Requires Docker. Data is persisted in a named volume (`wikiroll-data`). SQLite database at `/data/wikiroll.db`.

> **Note:** Enable the **Message Content** privileged intent in the [Discord Developer Portal](https://discord.com/developers/applications) for prefix commands (`w.`) to work.

### top.gg Webhook (optional)

To enable vote rewards, set up a webhook in your top.gg bot dashboard pointing to `https://your-domain/topgg/vote`. Set the webhook secret and add it to your `.env` as `TOPGG_WEBHOOK_SECRET`. The bot exposes the webhook server on port `3015`.

## Stack

- [discord.js](https://discord.js.org/) v14
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [axios](https://axios-http.com/)
- [express](https://expressjs.com/) (webhook server)
- Wikipedia REST API + MediaWiki Action API
- Fandom, wiki.gg, and other MediaWiki APIs

---

[hackatoa.com](https://hackatoa.com) · [GitHub](https://github.com/Hackatoan) · [![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/hackatoa)
