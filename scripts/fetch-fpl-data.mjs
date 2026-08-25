// Fetches everything the /fpldraft dashboard needs from the FPL Draft API
// and writes snapshot.json. Run by .github/workflows/fpl-data.yml every few
// minutes; the dashboard reads the snapshot from the fpl-data branch because
// the FPL API blocks cross-origin browser requests.
import { writeFileSync } from "node:fs";

const BASE = "https://draft.premierleague.com/api";
const HDRS = { "User-Agent": "Mozilla/5.0 FPL-Draft-Dashboard", Accept: "application/json" };

// Max's teams (league id -> his league_entry id)
const TEAMS = [
  { leagueId: 1021, leagueEntryId: 5592 },
  { leagueId: 1950, leagueEntryId: 5522 },
  { leagueId: 23236, leagueEntryId: 126859 },
];

const responses = {};
async function get(path, { store = true } = {}) {
  const r = await fetch(BASE + path, { headers: HDRS });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  const data = await r.json();
  if (store) responses[path] = data;
  return data;
}

const game = await get("/game");
let ev = game.current_event;

// same display rule as the pages: a finished GW keeps showing for ~24h after
// its last kickoff, then we serve the upcoming GW's data instead
if (ev && game.current_event_finished && game.next_event) {
  const curFx = await get(`/event/${ev}/fixtures`); // stored - the pages need it for this check too
  const lastKO = Math.max(...curFx.map(f => Date.parse(f.kickoff_time)));
  if (Date.now() > lastKO + 26 * 3600 * 1000) ev = game.next_event;
}

if (ev) {
  // slim the two big payloads down to the fields the dashboard uses
  const bs = await get("/bootstrap-static", { store: false });
  responses["/bootstrap-static"] = {
    elements: bs.elements.map(e => ({
      id: e.id, web_name: e.web_name, team: e.team, element_type: e.element_type,
      ep_this: e.ep_this, draft_rank: e.draft_rank, status: e.status,
      chance_of_playing_this_round: e.chance_of_playing_this_round,
    })),
  };
  // live data may not exist yet for an upcoming GW
  let live;
  try { live = await get(`/event/${ev}/live`, { store: false }); }
  catch { live = { elements: {} }; }
  responses[`/event/${ev}/live`] = {
    elements: Object.fromEntries(
      Object.entries(live.elements).map(([id, v]) => [id, { stats: v.stats }])),
  };
  await get(`/event/${ev}/fixtures`);

  // picks for every team in every league (powers the league pages too)
  for (const t of TEAMS) {
    const d = await get(`/league/${t.leagueId}/details`);
    for (const e of d.league_entries) {
      if (!e.entry_id) continue;
      try { await get(`/entry/${e.entry_id}/event/${ev}`); }
      catch {
        // upcoming GW lineups may not exist until waivers process - serve
        // last GW's squad under the requested path until they do
        try {
          const prev = await get(`/entry/${e.entry_id}/event/${ev - 1}`, { store: false });
          responses[`/entry/${e.entry_id}/event/${ev}`] = prev;
        } catch (err) { console.log(`skip picks ${e.entry_id}: ${err.message}`); }
      }
    }
  }
}

writeFileSync("snapshot.json",
  JSON.stringify({ fetched_at: new Date().toISOString(), responses }));
console.log(`snapshot.json written: ${Object.keys(responses).length} endpoints, GW ${ev}`);
