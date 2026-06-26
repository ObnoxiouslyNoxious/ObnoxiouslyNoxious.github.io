/**
 * Cloudflare Worker — Steam Workshop Stats Proxy
 * Add new mod IDs to MOD_IDS when you publish a new mod.
 */

const STEAM_API_KEY = '4A3C87D199E7D9CDB1C0843EB52E2C26';

const MOD_IDS = [
  '3737205872', // Auto-Drink Revert
  '3736268686', // Skill Master
  '3733578471', // AEBS Imperial & Metric Display
  '3730705272', // Random Spawn Locations
  '3728443049', // Zombies Have Smokes
  '3728283972', // Zombies Have Ammo
  '3728275018', // Zombies Have Money
  '3752111970', // Daily Challenges & Leaderboard
];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/github-chart') {
    try {
      const res = await fetch('https://ghchart.rshah.org/3fb950/obnoxiouslynoxious');
      const svg = await res.text();
      return new Response(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          ...cors()
        }
      });
    } catch (err) {
      return new Response('', { status: 502, headers: cors() });
    }
  }

  if (request.method === 'GET' && url.pathname === '/mods') {
    try {
      const params = new URLSearchParams({
        key:             STEAM_API_KEY,
        includevotes:    'true',
        includetags:     'false',
        includekvtags:   'false',
        includechildren: 'false',
      });
      MOD_IDS.forEach((id, i) => params.append(`publishedfileids[${i}]`, id));

      const res  = await fetch(`https://api.steampowered.com/IPublishedFileService/GetDetails/v1/?${params}`);
      const text = await res.text();

      let data;
      try { data = JSON.parse(text); }
      catch(_) { return jsonResp({ error: 'Steam API non-JSON', raw: text.slice(0, 300), mods: [] }, 502); }

      const details = data?.response?.publishedfiledetails ?? [];

      const mods = details
        .filter(d => d.result === 1)
        .map(d => ({
          id:            d.publishedfileid,
          name:          d.title,
          views:         d.views               ?? 0,
          subscriptions: d.subscriptions       ?? 0,
          favorited:     d.favorited           ?? 0,
          votes_up:      d.vote_data?.votes_up ?? 0,
          updated:       d.time_updated        ?? 0,
        }))
        .sort((a, b) => b.subscriptions - a.subscriptions);

      return jsonResp({ mods });

    } catch (err) {
      return jsonResp({ error: err.message, mods: [] }, 500);
    }
  }

  return new Response('Not found', { status: 404, headers: cors() });
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() }
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
