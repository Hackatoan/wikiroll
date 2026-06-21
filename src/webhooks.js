import { createServer } from 'http';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from './database.js';

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

      if (type === 'upvote' || type === 'test') {
        db.prepare(`
          INSERT INTO vote_credits (user_id, credits, last_voted)
          VALUES (?, 1, unixepoch())
          ON CONFLICT(user_id) DO UPDATE SET
            credits = credits + 1,
            last_voted = unixepoch()
        `).run(user);

        try {
          const discordUser = await client.users.fetch(user);
          await discordUser.send(
            '🗳️ **Thanks for voting for WikiRoll on top.gg!**\n' +
            'You earned **1 free roll** — your next `/roll` will skip the cooldown.\n\n' +
            '> You can vote again after 12 hours to stock up!'
          );
        } catch {}
      }

      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  }).listen(port, () => console.log(`[WikiRoll] HTTP server on port ${port}`));
}
