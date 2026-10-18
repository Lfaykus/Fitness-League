// Fitness League scoring. All points are computed from raw logged amounts,
// so nobody can store a fake point total.

export const PR_BONUS = 15;

export const CATEGORIES = ["Cardio", "Strength", "Mind", "Daily goals"];

// rate = points per unit. flat = fixed points per entry. daily = once per day max.
export const ACTIVITIES = [
  { id: "run",       label: "Run",            icon: "🏃", cat: "Cardio",   unit: "miles",   rate: 10,    step: 0.01, pr: true },
  { id: "swim",      label: "Swim",           icon: "🏊", cat: "Cardio",   unit: "yards",   rate: 0.02,  step: 25,   pr: true },
  { id: "bike",      label: "Bike",           icon: "🚴", cat: "Cardio",   unit: "miles",   rate: 3,     step: 0.1,  pr: true },
  { id: "pushups",   label: "Pushups",        icon: "💪", cat: "Strength", unit: "reps",    rate: 0.1,   step: 1,    pr: true },
  { id: "pullups",   label: "Pullups",        icon: "🧗", cat: "Strength", unit: "reps",    rate: 1 / 3, step: 1,    pr: true },
  { id: "gym",       label: "Gym session",    icon: "🏋️", cat: "Strength", flat: 15,        note: "Full session" },
  { id: "murph",     label: "Murph",          icon: "🎖️", cat: "Strength", flat: 20 + 100 / 3 + 20 + 10,
    note: "1 mi run, 100 pullups, 200 pushups, 1 mi run. Includes the +10 bonus. Don't log the parts separately." },
  { id: "duolingo",  label: "Duolingo",       icon: "🦉", cat: "Mind",     unit: "minutes", rate: 0.5,   step: 1 },
  { id: "learning",  label: "Learning something new", icon: "🎹", cat: "Mind", unit: "minutes", rate: 0.8, step: 1,
    askNote: true, note: "Has to be genuinely new: a new song, a new trick, a new skill" },
  { id: "protein",   label: "Protein goal",   icon: "🥩", cat: "Daily goals", flat: 5,  daily: true, note: "1 g per lb of bodyweight" },
  { id: "calories",  label: "Calorie goal",   icon: "🍽️", cat: "Daily goals", flat: 5,  daily: true, note: "Your own cut / bulk / maintain target" },
  { id: "scrolling", label: "Scrolling ≤ 30 min", icon: "📵", cat: "Daily goals", flat: 10, daily: true,
    note: "Social apps only (TikTok, Instagram, Reels, Shorts). Check Screen Time." },
];

export const ACT = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

// ---- dates (local time, weeks run Monday to Sunday) ----
export function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function today() { return fmtDate(new Date()); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
export function weekStart(s) { const d = parseDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fmtDate(d); }
export function dayIndex(s) { return (parseDate(s).getDay() + 6) % 7; } // Mon = 0

export function basePoints(activity, amount) {
  const a = ACT[activity];
  if (!a) return 0;
  return a.flat != null ? a.flat : a.rate * (Number(amount) || 0);
}

// Returns Map(entryId -> { base, pr, points }).
// PR rules: your first week doing an activity sets the baseline; after that, beating your
// best single entry earns +15, max one PR per activity per week. Daily goals count once per day.
export function scoreEntries(entries) {
  const sorted = entries
    .filter(e => ACT[e.activity] && typeof e.date === "string")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  const best = {}, firstWeek = {}, prTaken = new Set(), dailySeen = new Set();
  const out = new Map();
  for (const e of sorted) {
    const a = ACT[e.activity];
    const wk = weekStart(e.date);
    const key = e.uid + "|" + e.activity;
    let base = basePoints(e.activity, e.amount);
    let pr = false;
    if (a.daily) {
      const k = key + "|" + e.date;
      if (dailySeen.has(k)) base = 0; else dailySeen.add(k);
    }
    if (a.pr) {
      const amt = Number(e.amount) || 0;
      if (firstWeek[key] === undefined) firstWeek[key] = wk;
      else if (wk > firstWeek[key] && amt > best[key] && !prTaken.has(key + "|" + wk)) {
        pr = true;
        prTaken.add(key + "|" + wk);
      }
      best[key] = Math.max(best[key] ?? 0, amt);
    }
    out.set(e.id, { base, pr, points: base + (pr ? PR_BONUS : 0) });
  }
  return out;
}

// weeks[weekStart][uid] = { total, cats: {cat: pts}, days: [7], entries: [] }
export function aggregate(entries, scores) {
  const weeks = {};
  for (const e of entries) {
    const s = scores.get(e.id);
    if (!s) continue;
    const wk = weekStart(e.date);
    const w = (weeks[wk] ??= {});
    const p = (w[e.uid] ??= { total: 0, cats: {}, days: [0, 0, 0, 0, 0, 0, 0], entries: [] });
    p.total += s.points;
    const cat = ACT[e.activity].cat;
    p.cats[cat] = (p.cats[cat] || 0) + s.points;
    p.days[dayIndex(e.date)] += s.points;
    p.entries.push({ ...e, ...s });
  }
  return weeks;
}

// Season standings over finished weeks (before currentWeek). Ties share the win.
export function seasonStandings(weeks, uids, currentWeek) {
  const rows = Object.fromEntries(uids.map(u => [u, { uid: u, wins: 0, total: 0, bestWeek: 0 }]));
  for (const [wk, players] of Object.entries(weeks)) {
    for (const [uid, p] of Object.entries(players)) {
      const r = (rows[uid] ??= { uid, wins: 0, total: 0, bestWeek: 0 });
      r.total += p.total;
      r.bestWeek = Math.max(r.bestWeek, p.total);
    }
    if (wk >= currentWeek) continue;
    const top = Math.max(...Object.values(players).map(p => p.total));
    if (top <= 0) continue;
    for (const [uid, p] of Object.entries(players)) if (p.total === top) rows[uid].wins++;
  }
  return Object.values(rows).sort((a, b) => b.wins - a.wins || b.total - a.total);
}

export function fmtPts(n) { return Math.round(n).toLocaleString(); }
