// Periodically posts WikiRoll's guild count to the bot lists so their
// listing counts + graphs stay accurate. No-ops for any site whose token
// is unset, so it's safe to run with only one (or none) configured.
//
//   TOPGG_TOKEN    → POST https://top.gg/api/bots/:id/stats      { server_count }
//   DBL_API_TOKEN  → POST https://discordbotlist.com/api/v1/bots/:id/stats { guilds }

const POST_INTERVAL_MS = 30 * 60 * 1000; // every 30 min

async function post(url, auth, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log(`[stats] ${url} → ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
  } catch (e) {
    console.log(`[stats] ${url} failed:`, e.message);
  }
}

async function postAll(client) {
  const guilds   = client.guilds.cache.size;
  const clientId = client.user.id;

  if (process.env.TOPGG_TOKEN) {
    await post(`https://top.gg/api/bots/${clientId}/stats`,
      process.env.TOPGG_TOKEN, { server_count: guilds });
  }
  if (process.env.DBL_API_TOKEN) {
    await post(`https://discordbotlist.com/api/v1/bots/${clientId}/stats`,
      `Bot ${process.env.DBL_API_TOKEN}`, { guilds });
  }
  console.log(`[stats] posted guild count (${guilds})`);
}

export function startStatsPoster(client) {
  if (!process.env.TOPGG_TOKEN && !process.env.DBL_API_TOKEN) return;
  postAll(client);
  setInterval(() => postAll(client), POST_INTERVAL_MS);
}
