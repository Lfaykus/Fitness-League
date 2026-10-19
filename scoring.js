// Fitness League scoring. Points are always computed from raw logged amounts,
// so nobody can store a fake total. League settings can override point values,
// hide activities, or add custom ones.

export const PR_BONUS = 15;
export const CATEGORIES = ["Cardio", "Strength", "Mind", "Daily goals"];

// rate = points per unit. flat = fixed points per entry. daily = counts once per day.
export const DEFAULT_ACTIVITIES = [
  { id: "run",       label: "Run",            icon: "🏃", cat: "Cardio",   unit: "miles",   rate: 10,    step: 0.01, pr: true },
  { id: "swim",      label: "Swim",           icon: "🏊", cat: "Cardio",   unit: "yards",   rate: 0.02,  step: 25,   pr: true },
  { id: "bike",      label: "Bike",           icon: "🚴", cat: "Cardio",   unit: "miles",   rate: 3,     step: 0.1,  pr: true },
  { id: "pushups",   label: "Pushups",        icon: "💪", cat: "Strength", unit: "reps",    rate: 0.1,   step: 1,    pr: true },
  { id: "pullups",   label: "Pullups",        icon: "🧗", cat: "Strength", unit: "reps",    rate: 1 / 3, step: 1,    pr: true },
  { id: "gym",       label: "Gym session",    icon: "🏋️", cat: "Strength", flat: 15, note: "Full session" },
  { id: "murph",     label: "Murph",          icon: "🎖️", cat: "Strength", flat: 83,
    note: "83 points: covers the 2 miles, 100 pullups and 200 pushups, plus a 10-point bonus. Don't log the parts separately." },
  { id: "duolingo",  label: "Duolingo",       icon: "🦉", cat: "Mind",     unit: "minutes", rate: 0.5,   step: 1 },
  { id: "learning",  label: "Learning something new", icon: "🎹", cat: "Mind", unit: "minutes", rate: 0.8, step: 1,
    askNote: true, note: "Has to be genuinely new: a new song, a new trick, a new skill" },
  { id: "protein",   label: "Protein goal",   icon: "🥩", cat: "Daily goals", flat: 5,  daily: true, note: "Hit your protein target (set in your profile)" },
  { id: "calories",  label: "Calorie goal",   icon: "🍽️", cat: "Daily goals", flat: 5,  daily: true, note: "Hit your cut / bulk / maintain target (set in your profile)" },
  { id: "scrolling", label: "Scrolling ≤ 30 min", icon: "📵", cat: "Daily goals", flat: 10, daily: true,
    note: "Social apps only (TikTok, Instagram, Reels, Shorts). Check Screen Time." },
];
const DEFAULT_IDS = new Set(DEFAULT_ACTIVITIES.map(a => a.id));

// One-tap amounts shown in the log sheet.
export const PRESETS = {
  run: [1, 2, 3, 5], swim: [500, 1000, 1500, 2000], bike: [5, 10, 15, 25],
  pushups: [25, 50, 75, 100], pullups: [10, 20, 30, 50],
  duolingo: [10, 15, 20, 30], learning: [10, 20, 30, 60],
};

// Live activity list (defaults + league overrides). Hidden ones stay so old entries keep scoring.
export let ACTIVITIES = DEFAULT_ACTIVITIES.map(a => ({ ...a }));
export let ACT = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));

const num = v => (typeof v === "number" && isFinite(v) && v >= 0 ? v : undefined);

export function applySettings(settings) {
  const ov = settings?.activities || {};
  const list = DEFAULT_ACTIVITIES.map(a => {
    const o = ov[a.id] || {};
    const out = { ...a, hidden: !!o.hidden };
    if (typeof o.label === "string" && o.label.trim()) out.label = o.label.trim().slice(0, 30);
    if (a.flat != null && num(o.flat) !== undefined) out.flat = o.flat;
    if (a.flat == null && num(o.rate) !== undefined) out.rate = o.rate;
    return out;
  });
  for (const [id, o] of Object.entries(ov)) {
    if (DEFAULT_IDS.has(id) || !o || typeof o.label !== "string") continue;
    const isFlat = num(o.flat) !== undefined;
    list.push({
      id, custom: true, label: o.label.slice(0, 30), icon: o.icon || "⭐",
      cat: CATEGORIES.includes(o.cat) ? o.cat : "Mind",
      ...(isFlat ? { flat: o.flat } : { unit: (o.unit || "units").slice(0, 15), rate: num(o.rate) ?? 1, step: 1 }),
      daily: !!o.daily, hidden: !!o.hidden,
    });
  }
  ACTIVITIES = list;
  ACT = Object.fromEntries(list.map(a => [a.id, a]));
}

// "1 per 3 reps", "2 per 100 yards", "10 per mile"
export function rateText(a) {
  if (a.flat != null) return `${+a.flat.toFixed(2)}${a.daily ? " per day" : ""}`;
  for (const n of [1, 3, 10, 100]) {
    const p = a.rate * n;
    if (p >= 1 && Math.abs(p - Math.round(p)) < 1e-9) {
      const unit = n === 1 ? a.unit.replace(/s$/, "") : a.unit;
      return `${Math.round(p)} per ${n === 1 ? "" : n + " "}${unit}`;
    }
  }
  return `${+a.rate.toFixed(3)} per ${a.unit.replace(/s$/, "")}`;
}

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

// Map(entryId -> { base, pr, points }).
// PRs: first week doing an activity sets the baseline; after that, beating your best
// single entry earns +15, max one PR per activity per week. Daily goals count once per day.
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
    let pr = false, prev = undefined;
    if (a.daily) {
      const k = key + "|" + e.date;
      if (dailySeen.has(k)) base = 0; else dailySeen.add(k);
    }
    if (a.pr) {
      const amt = Number(e.amount) || 0;
      if (firstWeek[key] === undefined) firstWeek[key] = wk;
      else if (wk > firstWeek[key] && amt > best[key] && !prTaken.has(key + "|" + wk)) {
        pr = true; prev = best[key];
        prTaken.add(key + "|" + wk);
      }
      best[key] = Math.max(best[key] ?? 0, amt);
    }
    out.set(e.id, { base, pr, prev, points: base + (pr ? PR_BONUS : 0) });
  }
  return out;
}

// weeks[weekStart][uid] = { total, cats, days: [7], acts: {id: amount}, entries }
export function aggregate(entries, scores) {
  const weeks = {};
  for (const e of entries) {
    const s = scores.get(e.id);
    if (!s) continue;
    const wk = weekStart(e.date);
    const w = (weeks[wk] ??= {});
    const p = (w[e.uid] ??= { total: 0, cats: {}, days: [0, 0, 0, 0, 0, 0, 0], acts: {}, entries: [] });
    p.total += s.points;
    const cat = ACT[e.activity].cat;
    p.cats[cat] = (p.cats[cat] || 0) + s.points;
    p.days[dayIndex(e.date)] += s.points;
    p.acts[e.activity] = (p.acts[e.activity] || 0) + (Number(e.amount) || 0);
    p.entries.push({ ...e, ...s });
  }
  return weeks;
}

// Winners of a finished week (ties share). Empty if nobody scored.
export function weekWinners(players) {
  const vals = Object.values(players || {});
  if (!vals.length) return [];
  const top = Math.max(...vals.map(p => p.total));
  if (top <= 0) return [];
  return Object.entries(players).filter(([, p]) => p.total === top).map(([u]) => u);
}

export function seasonStandings(weeks, uids, currentWeek) {
  const rows = Object.fromEntries(uids.map(u => [u, { uid: u, wins: 0, total: 0, bestWeek: 0 }]));
  for (const [wk, players] of Object.entries(weeks)) {
    for (const [uid, p] of Object.entries(players)) {
      const r = (rows[uid] ??= { uid, wins: 0, total: 0, bestWeek: 0 });
      r.total += p.total;
      r.bestWeek = Math.max(r.bestWeek, p.total);
    }
    if (wk < currentWeek) for (const uid of weekWinners(players)) rows[uid].wins++;
  }
  return Object.values(rows).sort((a, b) => b.wins - a.wins || b.total - a.total);
}

// Consecutive days with at least one entry, ending today (or yesterday if nothing yet today).
export function streak(entries, uid, todayStr = today()) {
  const days = new Set(entries.filter(e => e.uid === uid).map(e => e.date));
  let d = days.has(todayStr) ? todayStr : addDays(todayStr, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// Best single amount per PR-able activity.
export function personalBests(entries, uid) {
  const out = {};
  for (const e of entries) {
    if (e.uid !== uid || !ACT[e.activity]?.pr) continue;
    const v = Number(e.amount) || 0;
    if (v > (out[e.activity]?.amount ?? 0)) out[e.activity] = { amount: v, date: e.date };
  }
  return out;
}

export function fmtPts(n) { return Math.round(n).toLocaleString(); }
export function fmtAmt(n) { return Number.isInteger(n) ? n.toLocaleString() : (+n.toFixed(2)).toLocaleString(); }
