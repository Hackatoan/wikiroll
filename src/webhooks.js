import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { db, addShards } from './database.js';

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyTopggSignature(rawBody, signatureHeader, secret) {
  // header format: t={timestamp},v1={signature}
  const parts = Object.fromEntries(signatureHeader.split(',').map(p => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(parts.v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

const VOTE_SHARDS = 12;

// Shared reward for an upvote from any bot-list site: record the vote (for
// "haven't voted yet" nudges), grant Shards 💠, and DM the voter.
async function rewardVote(client, user, site) {
  db.prepare(`
    INSERT INTO vote_credits (user_id, credits, last_voted)
    VALUES (?, 0, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET last_voted = unixepoch()
  `).run(user);
  const balance = addShards(user, VOTE_SHARDS);
  console.log(`[webhook] +${VOTE_SHARDS} shards to ${user} via ${site} (now ${balance})`);
  try {
    const discordUser = await client.users.fetch(user);
    await discordUser.send(
      `🗳️ **Thanks for voting for WikiRoll on ${site}!**\n` +
      `You earned **${VOTE_SHARDS} 💠 Shards** — now **${balance} 💠** total.\n` +
      'Spend them in `/shop` (e.g. an instant extra roll).\n\n' +
      '> You can vote again in 12 hours to stack up more!'
    );
  } catch (e) { console.log(`[webhook] DM failed for ${user}:`, e.code, e.message); }
}

export function startWebhookServer(client, port = 3015) {
  createServer(async (req, res) => {
    const { method, url } = req;

    if (url === '/stats' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const totalChars = db.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
      const totalUsers = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM ownership').get().n;
      res.end(JSON.stringify({
        guilds: client.guilds.cache.size,
        characters: totalChars,
        users: totalUsers,
      }));
      return;
    }

    if (url === '/health' && method === 'GET') {
      res.end('ok');
      return;
    }

    if (url.startsWith('/topgg/vote') && method === 'POST') {
      const secret = process.env.TOPGG_WEBHOOK_SECRET;
      const rawBody = await readRawBody(req);
      const sigHeader = req.headers['x-topgg-signature'];

      if (secret && sigHeader) {
        if (!verifyTopggSignature(rawBody, sigHeader, secret)) {
          res.writeHead(401);
          res.end('Unauthorized');
          return;
        }
      }

      let body;
      try { body = JSON.parse(rawBody.toString()); } catch { body = {}; }
      const { user, type } = body;
      if (!user) { res.writeHead(400); res.end('Bad Request'); return; }

      console.log(`[webhook] top.gg vote from ${user} type=${type}`);
      if (type === 'upvote' || type === 'test') {
        await rewardVote(client, user, 'top.gg');
      }

      res.writeHead(200);
      res.end();
      return;
    }

    // ── Discord Bot List (discordbotlist.com) upvote webhook ──
    // Sends a plain `Authorization: <secret>` header and a JSON body
    // { id, username, avatar, admin }. Configure the URL + secret in the DBL
    // bot dashboard, and set DBL_WEBHOOK_SECRET to match.
    if (url.startsWith('/dbl/vote') && method === 'POST') {
      const secret  = process.env.DBL_WEBHOOK_SECRET;
      const rawBody = await readRawBody(req);
      const auth    = req.headers['authorization'];

      if (secret && auth !== secret) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }

      let body;
      try { body = JSON.parse(rawBody.toString()); } catch { body = {}; }
      const user = body.id;
      if (!user) { res.writeHead(400); res.end('Bad Request'); return; }

      console.log(`[webhook] discordbotlist vote from ${user}`);
      await rewardVote(client, user, 'Discord Bot List');

      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  }).listen(port, () => console.log(`[WikiRoll] HTTP server on port ${port}`));
}
