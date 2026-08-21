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
const ev = game.current_event;

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
  const live = await get(`/event/${ev}/live`, { store: false });
  responses[`/event/${ev}/live`] = {
    elements: Object.fromEntries(
      Object.entries(live.elements).map(([id, v]) => [id, { stats: v.stats }])),
  };
  await get(`/event/${ev}/fixtures`);

  for (const t of TEAMS) {
    const d = await get(`/league/${t.leagueId}/details`);
    const me = d.league_entries.find(e => e.id === t.leagueEntryId);
    if (!me) continue;
    const entryIds = new Set([me.entry_id]);
    const m = (d.matches || []).find(m =>
      m.event === ev && (m.league_entry_1 === me.id || m.league_entry_2 === me.id));
    if (m) {
      const oppLE = m.league_entry_1 === me.id ? m.league_entry_2 : m.league_entry_1;
      const opp = d.league_entries.find(e => e.id === oppLE);
      if (opp?.entry_id) entryIds.add(opp.entry_id);
    }
    for (const id of entryIds) await get(`/entry/${id}/event/${ev}`);
  }
}

writeFileSync("snapshot.json",
  JSON.stringify({ fetched_at: new Date().toISOString(), responses }));
console.log(`snapshot.json written: ${Object.keys(responses).length} endpoints, GW ${ev}`);
