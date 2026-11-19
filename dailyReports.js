"use strict";

/**
 * Daily Reports — finds the things that are easy to miss in one day's
 * submitted data (pressDB, kensaDB, slitDB, SRSDB + stop calls, checklist
 * bypasses, NG tickets) by comparing each item with its OWN last 30 days.
 *
 *   GET /api/reports/daily?date=YYYY-MM-DD[&refresh=1]
 *
 * Returns { date, days, factories, kpis, findings[] }. Findings carry
 * structured params only; the admin UI turns them into words (en/ja).
 *
 * Rules agreed with the admins (2026-11-19):
 *   - "Script Unlock / Console" stop calls are a system account → excluded.
 *   - Stop-call clock strings ("11:34" / "11:34 AM") are normalised to HH:MM.
 *   - Same report for every role.
 */

const PROCS = [
  { key: "press", col: "pressDB" },
  { key: "kensa", col: "kensaDB" },
  { key: "slit", col: "slitDB" },
  { key: "srs", col: "SRSDB" },
];
const DEFECT_FIELDS = {
  press: ["疵引不良", "加工不良", "その他", "非不良廃棄"],
  slit: ["疵引不良", "加工不良", "その他"],
  srs: ["くっつき・めくれ", "シワ", "転写位置ズレ", "転写不良", "文字欠け", "その他"],
};
const SPEED_PROCS = new Set(["press", "slit", "srs"]);
const SYSTEM_LEADER_RE = /script\s*unlock|console/i;
const BASELINE_DAYS = 30;
const TREND_POINTS = 13;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SEV_RANK = { high: 0, medium: 1, info: 2, ongoing: 3, good: 4 };

// ─── small helpers ───────────────────────────────────────────────────────────
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function jstToday() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function qtyOf(d) {
  return num(d.Process_Quantity ?? d.Total);
}
function ngOf(d) {
  return d._proc === "srs" ? num(d.SRS_Total_NG ?? d.Total_NG) : num(d.Total_NG);
}
function pct(ng, qty) {
  return qty > 0 ? (100 * ng) / qty : null;
}
function round(v, dp = 2) {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
function median(values) {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function parseClock(t) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(String(t || "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3] ? m[3].toUpperCase() : null;
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}
function normalizeClock(t) {
  const m = parseClock(t);
  if (m == null) return t || "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function durationMin(d) {
  const a = parseClock(d.Time_start);
  const b = parseClock(d.Time_end);
  if (a == null || b == null) return null;
  return (b - a + 1440) % 1440;
}
function splitWorkers(name) {
  return String(name || "")
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function pool(records) {
  let ng = 0;
  let qty = 0;
  for (const r of records) {
    ng += ngOf(r);
    qty += qtyOf(r);
  }
  return { ng, qty, rate: pct(ng, qty), n: records.length };
}
function groupBy(list, keyFn) {
  const m = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}
function mode(values) {
  const c = new Map();
  values.forEach((v) => c.set(v, (c.get(v) || 0) + 1));
  let best = null;
  let bestN = -1;
  c.forEach((n, v) => {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  });
  return best;
}
/** Only the fields the record modal / tables need — keeps the payload small. */
function slim(d) {
  return {
    _id: d._id,
    _source: d._source,
    Date: d.Date,
    工場: d["工場"],
    設備: d["設備"],
    品番: d["品番"],
    背番号: d["背番号"],
    Worker_Name: d.Worker_Name,
    Time_start: d.Time_start,
    Time_end: d.Time_end,
    Process_Quantity: d.Process_Quantity,
    Total: d.Total,
    Total_NG: d.Total_NG ?? d.SRS_Total_NG,
    Cycle_Time: d.Cycle_Time,
    Comment: d.Comment,
  };
}

// ─── report builder ──────────────────────────────────────────────────────────
async function buildDailyReport(db, date) {
  const D = date;
  const FROM = addDays(D, -BASELINE_DAYS);

  const loaded = await Promise.all(
    PROCS.map(async (p) => {
      const docs = await db
        .collection(p.col)
        .find({ Date: { $gte: FROM, $lte: D } })
        .project({
          初物チェック画像: 0,
          終物チェック画像: 0,
          材料ラベル画像: 0,
          materialLabelImages: 0,
          defectImages: 0,
          Break_Time_Data: 0,
          Maintenance_Data: 0,
          Lot_Details: 0,
        })
        .toArray();
      docs.forEach((d) => {
        d._source = p.col;
        d._proc = p.key;
      });
      return docs;
    })
  );
  const all = loaded.flat();
  const today = all.filter((d) => d.Date === D);
  const base = all.filter((d) => d.Date < D);

  const workDays = [...new Set(all.map((d) => d.Date))].sort();
  if (!workDays.includes(D)) workDays.push(D);
  workDays.sort();
  const baseDays = workDays.filter((x) => x < D);
  const trendDays = workDays.filter((x) => x <= D).slice(-TREND_POINTS);
  const prevDay = baseDays[baseDays.length - 1] || null;

  const factories = [...new Set(all.map((d) => d["工場"]).filter(Boolean))].sort();
  const findings = [];
  const add = (f) => findings.push({ ...f, id: `${f.type}-${findings.length}` });
  const series = (records, valueFn) => {
    const byDay = groupBy(records, (r) => r.Date);
    return trendDays.map((day) => ({ date: day, value: byDay.has(day) ? round(valueFn(byDay.get(day))) : null }));
  };
  const activeDays = (records) => new Set(records.map((r) => r.Date)).size || 1;

  // ── baselines by part ───────────────────────────────────────────────────
  const partKey = (d) => `${d._proc}|${d["背番号"]}`;
  const basePart = new Map();
  for (const [k, list] of groupBy(base, partKey)) basePart.set(k, pool(list));
  const allPart = groupBy(all, partKey);

  // ── A. same part high in 2+ places, then single-record spikes ───────────
  const used = new Set();
  const scored = today
    .filter((d) => qtyOf(d) >= 50)
    .map((d) => {
      const b = basePart.get(partKey(d));
      return { d, r: pct(ngOf(d), qtyOf(d)), b: b && b.n >= 3 ? b.rate : null };
    })
    .filter((x) => x.b != null);

  const lastSpike = (pk, threshold) => {
    const days = groupBy((allPart.get(pk) || []).filter((r) => r.Date < D), (r) => r.Date);
    let found = null;
    days.forEach((list, day) => {
      const p = pool(list);
      if (p.qty >= 50 && p.rate >= threshold && (!found || day > found.date)) found = { date: day, rate: round(p.rate) };
    });
    return found;
  };

  const multiCand = scored.filter((x) => ngOf(x.d) >= 5 && x.r >= Math.max(2 * x.b, x.b + 3));
  for (const [pk, list] of groupBy(multiCand, (x) => partKey(x.d))) {
    const places = new Set(list.map((x) => `${x.d["工場"]}|${x.d["設備"]}`));
    if (places.size < 2) continue;
    list.forEach((x) => used.add(x.d));
    const todayAll = pool(today.filter((r) => partKey(r) === pk));
    const b = list[0].b;
    add({
      type: "qualityMultiPlace",
      cat: "quality",
      sev: "high",
      facs: [...new Set(list.map((x) => x.d["工場"]))],
      params: {
        seban: list[0].d["背番号"],
        process: list[0].d._proc,
        rate: round(todayAll.rate),
        base: round(b),
        places: list.map((x) => ({ factory: x.d["工場"], machine: x.d["設備"], worker: x.d.Worker_Name, ng: ngOf(x.d), qty: qtyOf(x.d), rate: round(x.r) })),
        prevHigh: lastSpike(pk, Math.max(2 * b, b + 3)),
      },
      trend: { unit: "%", points: series(allPart.get(pk) || [], (l) => pool(l).rate) },
      compare: { unit: "%", items: list.map((x) => ({ label: `${x.d["工場"]} · ${x.d["設備"]} (${x.d.Worker_Name})`, today: round(x.r), normal: round(b) })) },
      rows: list.map((x) => ({ cells: [x.d["工場"], x.d["設備"], x.d.Worker_Name, `${ngOf(x.d)} / ${qtyOf(x.d)}`, `${round(x.r, 1)}%`], record: slim(x.d) })),
      columns: ["factory", "machine", "worker", "ngQty", "ngRate"],
    });
  }

  const spikeCand = scored.filter((x) => !used.has(x.d) && ngOf(x.d) >= 5 && x.r >= Math.max(3 * x.b, x.b + 5));
  for (const [, list] of groupBy(spikeCand, (x) => `${x.d._proc}|${x.d["工場"]}|${x.d["設備"]}|${x.d.Worker_Name}`)) {
    list.sort((a, b) => b.r - a.r);
    list.forEach((x) => used.add(x.d));
    const top = list[0];
    const pk = partKey(top.d);
    const topAll = pool(today.filter((r) => partKey(r) === pk));
    add({
      type: "qualitySpike",
      cat: "quality",
      sev: top.r >= 10 ? "high" : "medium",
      facs: [top.d["工場"]],
      params: {
        worker: top.d.Worker_Name,
        machine: top.d["設備"],
        factory: top.d["工場"],
        process: top.d._proc,
        rate: round(top.r),
        base: round(top.b),
        topPart: top.d["背番号"],
        topPartAllRate: round(topAll.rate),
        topPartOthers: topAll.n > 1,
        parts: list.map((x) => ({ seban: x.d["背番号"], ng: ngOf(x.d), qty: qtyOf(x.d), rate: round(x.r), base: round(x.b), comment: x.d.Comment || "" })),
        prevSpike: lastSpike(pk, Math.max(3 * top.b, top.b + 5)),
      },
      trend: { unit: "%", points: series(allPart.get(pk) || [], (l) => pool(l).rate) },
      compare: { unit: "%", items: list.map((x) => ({ label: x.d["背番号"], today: round(x.r), normal: round(x.b) })) },
      rows: list.map((x) => ({ cells: [x.d["背番号"], x.d["設備"], x.d.Worker_Name, `${ngOf(x.d)} / ${qtyOf(x.d)}`, `${round(x.r, 1)}%`, x.d.Comment || ""], record: slim(x.d) })),
      columns: ["seban", "machine", "worker", "ngQty", "ngRate", "comment"],
    });
  }

  // ── B. chronic (always-high) parts → one "ongoing" card per factory ─────
  const chronic = scored.filter((x) => !used.has(x.d) && x.b >= 5 && x.r >= 5 && x.r >= 0.5 * x.b);
  for (const [fac, list] of groupBy(chronic, (x) => x.d["工場"])) {
    list.sort((a, b) => b.b - a.b);
    const keys = new Set(list.map((x) => partKey(x.d)));
    const top = list[0];
    add({
      type: "qualityOngoing",
      cat: "quality",
      sev: "ongoing",
      facs: [fac],
      params: {
        factory: fac,
        parts: [...groupBy(list, (x) => `${x.d["背番号"]}|${x.d["設備"]}`).values()].map((g) => ({
          seban: g[0].d["背番号"],
          machine: g[0].d["設備"],
          rate: round(pool(g.map((x) => x.d)).rate),
          base: round(g[0].b),
        })),
        rate: round(top.r),
        base: round(top.b),
      },
      trend: { unit: "%", points: series(all.filter((r) => keys.has(partKey(r))), (l) => pool(l).rate) },
      compare: {
        unit: "%",
        items: [...groupBy(list, (x) => x.d["背番号"]).values()].map((g) => ({ label: g[0].d["背番号"], today: round(pool(g.map((x) => x.d)).rate), normal: round(g[0].b) })),
      },
      rows: list.map((x) => ({ cells: [x.d["背番号"], x.d["設備"], x.d.Worker_Name, `${ngOf(x.d)} / ${qtyOf(x.d)}`, `${round(x.r, 1)}%`], record: slim(x.d) })),
      columns: ["seban", "machine", "worker", "ngQty", "ngRate"],
    });
  }

  // ── C. factory × process NG rate vs its normal (+ good news) ────────────
  const fpKey = (d) => `${d["工場"]}|${d._proc}`;
  const allFp = groupBy(all, fpKey);
  for (const [k, list] of groupBy(today, fpKey)) {
    const [fac, proc] = k.split("|");
    const t = pool(list);
    const fpAll = allFp.get(k) || [];
    const b = pool(fpAll.filter((r) => r.Date < D));
    if (t.qty < 1000 || b.qty < 1000 || b.rate == null) continue;
    const trend = { unit: "%", points: series(fpAll, (l) => pool(l).rate) };

    if (t.rate >= Math.max(1.5 * b.rate, b.rate + 0.5)) {
      const threshold = Math.max(1.5 * b.rate, b.rate + 0.5);
      const spikeDays = [];
      groupBy(fpAll.filter((r) => r.Date < D), (r) => r.Date).forEach((l, day) => {
        const p = pool(l);
        if (p.qty >= 1000 && p.rate >= threshold) spikeDays.push(day);
      });
      spikeDays.sort();
      // A weekday that keeps coming back among the spike days (incl. today).
      const byWeekday = groupBy(spikeDays.concat([D]), (day) => weekdayOf(day));
      let pattern = null;
      byWeekday.forEach((dates, wd) => {
        if (dates.length >= 3 && (!pattern || dates.length > pattern.dates.length)) pattern = { weekday: wd, dates: dates.sort() };
      });
      let topDefect = null;
      const fields = DEFECT_FIELDS[proc];
      if (fields) {
        const sum = (recs, f) => recs.reduce((s, r) => s + num(r[f]), 0);
        const baseList = fpAll.filter((r) => r.Date < D);
        const tTot = fields.reduce((s, f) => s + sum(list, f), 0) || 1;
        const bTot = fields.reduce((s, f) => s + sum(baseList, f), 0) || 1;
        const best = fields.map((f) => ({ name: f, count: sum(list, f), share: round((100 * sum(list, f)) / tTot, 0), baseShare: round((100 * sum(baseList, f)) / bTot, 0) })).sort((a, b2) => b2.count - a.count)[0];
        if (best && best.count > 0) topDefect = best;
      }
      const topRecs = [...list].sort((a, b2) => ngOf(b2) - ngOf(a)).slice(0, 5);
      add({
        type: "qualityFactoryRate",
        cat: "quality",
        sev: "medium",
        facs: [fac],
        params: {
          factory: fac,
          process: proc,
          rate: round(t.rate),
          base: round(b.rate),
          ng: t.ng,
          qty: t.qty,
          topDefect,
          topRecord: topRecs[0] ? { seban: topRecs[0]["背番号"], ng: ngOf(topRecs[0]), qty: qtyOf(topRecs[0]) } : null,
          spikeDays,
          weekdayPattern: pattern,
        },
        trend,
        compare: {
          unit: "%",
          items: [{ label: fac, today: round(t.rate), normal: round(b.rate) }].concat(
            topRecs.slice(0, 3).map((r) => ({ label: r["背番号"], today: round(pct(ngOf(r), qtyOf(r))), normal: round(b.rate) }))
          ),
        },
        rows: topRecs.map((r) => ({ cells: [r["背番号"], r["設備"], r.Worker_Name, `${ngOf(r)} / ${qtyOf(r)}`, `${round(pct(ngOf(r), qtyOf(r)), 1)}%`], record: slim(r) })),
        columns: ["seban", "machine", "worker", "ngQty", "ngRate"],
      });
    } else if (b.rate >= 0.2 && t.rate <= 0.3 * b.rate) {
      add({
        type: "qualityGood",
        cat: "quality",
        sev: "good",
        facs: [fac],
        params: { factory: fac, process: proc, rate: round(t.rate), base: round(b.rate), ng: t.ng, qty: t.qty, baseQty: Math.round(b.qty / activeDays(fpAll.filter((r) => r.Date < D))) },
        trend,
        compare: { unit: "%", items: [{ label: fac, today: round(t.rate), normal: round(b.rate) }] },
        rows: list.slice(0, 8).map((r) => ({ cells: [r["背番号"], r.Worker_Name, qtyOf(r), ngOf(r)], record: slim(r) })),
        columns: ["seban", "worker", "qty", "ng"],
      });
    }
  }

  // ── D. speed: same factory+machine+part, similar run size ───────────────
  const jobKey = (d) => `${d._proc}|${d["工場"]}|${d["設備"]}|${d["品番"]}`;
  const allJobs = groupBy(all.filter((d) => SPEED_PROCS.has(d._proc) && num(d.Cycle_Time) > 0), jobKey);
  const slowJobs = [];
  for (const [k, list] of groupBy(today.filter((d) => SPEED_PROCS.has(d._proc) && num(d.Cycle_Time) > 0), jobKey)) {
    const minutes = list.reduce((s, r) => s + (durationMin(r) || 0), 0);
    if (minutes < 20) continue;
    const runQty = median(list.map(qtyOf)) || 0;
    const baseList = (allJobs.get(k) || []).filter((r) => r.Date < D && (!runQty || (qtyOf(r) >= 0.5 * runQty && qtyOf(r) <= 2 * runQty)));
    if (baseList.length < 3) continue;
    const bCt = median(baseList.map((r) => num(r.Cycle_Time)));
    const tCt = median(list.map((r) => num(r.Cycle_Time)));
    if (!bCt || !tCt) continue;
    const ratio = tCt / bCt;
    if (ratio < 1.4) continue;
    const prevList = prevDay ? (allJobs.get(k) || []).filter((r) => r.Date === prevDay) : [];
    const prevCt = prevList.length ? median(prevList.map((r) => num(r.Cycle_Time))) : null;
    slowJobs.push({ k, list, tCt, bCt, ratio, n: baseList.length, slowPrev: prevCt != null && prevCt / bCt >= 1.4, prevCt });
  }
  for (const [, jobs] of groupBy(slowJobs, (j) => `${j.list[0]._proc}|${j.list[0]["工場"]}`)) {
    jobs.sort((a, b) => b.ratio - a.ratio);
    const worst = jobs[0];
    const w = worst.list[0];
    const machineNg = pool(today.filter((r) => r._proc === w._proc && r["工場"] === w["工場"] && r["設備"] === w["設備"]));
    add({
      type: "speedSlow",
      cat: "speed",
      sev: worst.ratio >= 2 ? "high" : "medium",
      facs: [w["工場"]],
      params: {
        factory: w["工場"],
        process: w._proc,
        count: jobs.length,
        machines: [...new Set(jobs.map((j) => j.list[0]["設備"]))],
        worst: { machine: w["設備"], hinban: w["品番"], today: round(worst.tCt, 1), base: round(worst.bCt, 1), ratio: round(worst.ratio, 2), slowPrev: worst.slowPrev, prevCt: round(worst.prevCt, 1) },
        machineNgRate: round(machineNg.rate),
      },
      trend: { unit: "s", points: series(allJobs.get(worst.k) || [], (l) => median(l.map((r) => num(r.Cycle_Time)))) },
      compare: { unit: "s", items: jobs.slice(0, 6).map((j) => ({ label: `${j.list[0]["品番"]} · ${j.list[0]["設備"]}`, today: round(j.tCt, 2), normal: round(j.bCt, 2) })) },
      rows: jobs.slice(0, 8).map((j) => ({
        cells: [j.list[0]["品番"], j.list[0]["設備"], j.list[0].Worker_Name, `${round(j.tCt, 1)} s`, `${round(j.bCt, 1)} s`, `+${Math.round(100 * (j.ratio - 1))}%`],
        record: slim(j.list[0]),
      })),
      columns: ["hinban", "machine", "worker", "cycleToday", "cycleNormal", "change"],
    });
  }

  // ── E. stop calls (leaders + machines) ──────────────────────────────────
  const events = [];
  for (const d of all) {
    for (const r of d.StopCall?.records || []) {
      if (SYSTEM_LEADER_RE.test(r.leaderName || "") || /^system/i.test(r.leaderUsername || "")) continue;
      events.push({
        date: d.Date,
        factory: d["工場"],
        machine: d["設備"],
        leader: r.leaderName || r.leaderUsername || "?",
        wait: num(r.waitSeconds),
        calledAt: normalizeClock(r.calledAt),
        arrivedAt: normalizeClock(r.arrivedAt),
        record: d,
      });
    }
  }
  const stopKpi = {};
  for (const [fac, evs] of groupBy(events, (e) => e.factory)) {
    const facRecords = all.filter((d) => d["工場"] === fac && d.StopCall);
    const nDays = new Set(facRecords.filter((d) => d.Date < D).map((d) => d.Date)).size || 1;
    const tEv = evs.filter((e) => e.date === D);
    const bEv = evs.filter((e) => e.date < D);
    stopKpi[fac] = { today: tEv.length, base: round(bEv.length / nDays, 1) };
    if (!tEv.length && !bEv.length) continue;

    const leaders = [...new Set(evs.map((e) => e.leader))].map((name) => {
      const t = tEv.filter((e) => e.leader === name);
      const b = bEv.filter((e) => e.leader === name);
      return {
        name,
        today: t.length,
        base: round(b.length / nDays, 1),
        avgWait: t.length ? Math.round(t.reduce((s, e) => s + e.wait, 0) / t.length) : null,
        maxWait: t.length ? Math.max(...t.map((e) => e.wait)) : null,
      };
    });
    const absent = leaders.filter((l) => l.base >= 5 && l.today === 0);
    const over = leaders.filter((l) => l.today >= 1.5 * l.base && l.today - l.base >= 8);
    if (tEv.length && (absent.length || over.length)) {
      const focus = absent[0] || over[0];
      const ranked = leaders.filter((l) => l.today > 0 || l.base >= 1).sort((a, b) => b.today - a.today || b.base - a.base);
      add({
        type: "leaderLoad",
        cat: "leaders",
        sev: absent.length && over.length ? "high" : "medium",
        facs: [fac],
        params: { factory: fac, absent: absent.map((l) => ({ name: l.name, base: l.base })), over: over.map((l) => ({ name: l.name, today: l.today, base: l.base })), focus: focus.name, total: tEv.length },
        trend: { unit: "", points: trendDays.map((day) => ({ date: day, value: evs.filter((e) => e.date === day && e.leader === focus.name).length })) },
        compare: { unit: "", items: ranked.slice(0, 8).map((l) => ({ label: l.name, today: l.today, normal: l.base })) },
        rows: ranked.slice(0, 10).map((l) => ({ cells: [l.name, l.today, l.base, l.avgWait, l.maxWait] })),
        columns: ["leader", "callsToday", "callsNormal", "avgWait", "maxWait"],
      });
    }

    const machines = [...groupBy(tEv, (e) => e.machine)].map(([machine, list]) => {
      const b = bEv.filter((e) => e.machine === machine).length / nDays;
      return { machine, today: list.length, base: round(b, 1), maxWait: Math.max(...list.map((e) => e.wait)) };
    }).sort((a, b) => b.today - a.today);
    const hot = machines[0];
    if (hot && hot.today >= 10 && hot.today >= 3 * hot.base) {
      add({
        type: "machineCalls",
        cat: "leaders",
        sev: "medium",
        facs: [fac],
        params: { factory: fac, machine: hot.machine, today: hot.today, base: hot.base, next: machines[1] ? { machine: machines[1].machine, today: machines[1].today } : null },
        trend: { unit: "", points: trendDays.map((day) => ({ date: day, value: evs.filter((e) => e.date === day && e.machine === hot.machine).length })) },
        compare: { unit: "", items: machines.slice(0, 8).map((m) => ({ label: m.machine, today: m.today, normal: m.base })) },
        rows: tEv.filter((e) => e.machine === hot.machine).map((e) => ({ cells: [e.calledAt, e.arrivedAt, e.leader, e.wait, e.record["背番号"]], record: slim(e.record) })),
        columns: ["calledAt", "arrivedAt", "leader", "waitSec", "seban"],
      });
    }
  }

  // ── F. checklist bypasses + open NG tickets ─────────────────────────────
  const dayStart = new Date(`${D}T00:00:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400e3);
  const [bypassToday, bypass30, openTickets] = await Promise.all([
    db.collection("checklistBypassDB").find({ createdAt: { $gte: dayStart, $lt: dayEnd } }).toArray(),
    db.collection("checklistBypassDB").find({ createdAt: { $gte: new Date(`${FROM}T00:00:00+09:00`), $lt: dayEnd } }).project({ factory: 1 }).toArray(),
    db.collection("ngReportsDB").find({ status: { $ne: "closed" } }).project({ factory: 1 }).toArray(),
  ]);
  const openByFac = {};
  openTickets.forEach((tk) => {
    openByFac[tk.factory || "?"] = (openByFac[tk.factory || "?"] || 0) + 1;
  });
  for (const [fac, list] of groupBy(bypassToday, (b) => b.factory || "?")) {
    add({
      type: "checklistBypass",
      cat: "leaders",
      sev: "info",
      facs: [fac],
      params: { factory: fac, count: list.length, count30: bypass30.filter((b) => b.factory === fac).length, openTickets: openByFac[fac] || 0, first: { machine: list[0].machine, leader: list[0].leaderName, reason: list[0].reason } },
      trend: null,
      compare: { unit: "", items: [{ label: fac, today: list.length, normal: round(bypass30.filter((b) => b.factory === fac).length / BASELINE_DAYS, 2) }] },
      rows: list.map((b) => ({ cells: [b.machine, b.workerName || "—", b.leaderName, b.reason] })),
      columns: ["machine", "worker", "leader", "reason"],
    });
  }

  // ── G. people ───────────────────────────────────────────────────────────
  const people = new Map();
  for (const d of all) {
    for (const name of splitWorkers(d.Worker_Name)) {
      if (!people.has(name)) people.set(name, { days: new Set(), facs: [], procs: [], todayRecs: 0 });
      const p = people.get(name);
      p.days.add(d.Date);
      p.facs.push(d["工場"]);
      p.procs.push(d._proc);
      if (d.Date === D) p.todayRecs += 1;
    }
  }
  const recentDays = workDays.filter((x) => x <= D).slice(-5);
  const todayWorkers = [...people.values()].filter((p) => p.days.has(D)).length;
  const avgWorkers = baseDays.length
    ? baseDays.reduce((s, day) => s + [...people.values()].filter((p) => p.days.has(day)).length, 0) / baseDays.length
    : 0;
  const normalDay = todayWorkers >= 0.5 * avgWorkers;
  const baseCount = (p) => [...p.days].filter((x) => x < D).length;
  const lastSeen = (p) => [...p.days].filter((x) => x < D).sort().pop() || null;
  const describe = (name, p) => ({ name, factory: mode(p.facs), process: mode(p.procs), lastSeen: lastSeen(p), days: baseCount(p) });

  // "長屋" and "長屋浩志" are the same person typed two ways: treat a name that
  // contains (or is contained in) someone who worked today as present.
  const todayNames = [...people].filter(([, p]) => p.days.has(D)).map(([n]) => n);
  const presentAs = (name) => todayNames.some((n) => n !== name && Math.min(n.length, name.length) >= 2 && (n.includes(name) || name.includes(n)));
  const absentLong = [];
  const missingToday = [];
  const newcomers = [];
  people.forEach((p, name) => {
    const n = baseCount(p);
    const regular = n >= Math.max(5, 0.4 * baseDays.length);
    const seenRecent = recentDays.some((x) => p.days.has(x));
    if (presentAs(name)) return;
    if (regular && !seenRecent && recentDays.length >= 5) absentLong.push(describe(name, p));
    else if (normalDay && n >= Math.max(5, 0.5 * baseDays.length) && !p.days.has(D) && seenRecent) missingToday.push(describe(name, p));
    if (p.days.has(D) && n <= 2) newcomers.push({ ...describe(name, p), records: p.todayRecs });
  });
  const peopleCard = (type, sev, list, sortFn) => {
    if (!list.length) return;
    list.sort(sortFn);
    add({
      type,
      cat: "people",
      sev,
      facs: [...new Set(list.map((w) => w.factory))],
      params: { count: list.length, workers: list.slice(0, 12) },
      trend: null,
      compare: { unit: type === "peopleNew" ? "" : "d", items: list.slice(0, 8).map((w) => ({ label: w.name, today: type === "peopleNew" ? w.records : w.days, normal: type === "peopleNew" ? 0 : w.days })) },
      rows: list.map((w) => ({ cells: [w.name, w.factory, w.process, type === "peopleNew" ? w.records : w.lastSeen, w.days] })),
      columns: ["worker", "factory", "process", type === "peopleNew" ? "recordsToday" : "lastSeen", "daysIn30"],
    });
  };
  peopleCard("peopleAbsent", "medium", absentLong, (a, b) => (a.lastSeen || "").localeCompare(b.lastSeen || ""));
  peopleCard("peopleMissingToday", "info", missingToday, (a, b) => b.days - a.days);
  peopleCard("peopleNew", "info", newcomers, (a, b) => b.records - a.records);

  // ── H. data quality ─────────────────────────────────────────────────────
  for (const [fac, list] of groupBy(today, (d) => d["工場"])) {
    const mismatch = list.filter((d) => d._proc !== "kensa" && d.Total != null && d.Process_Quantity != null && num(d.Total) !== num(d.Process_Quantity) - ngOf(d));
    if (mismatch.length) {
      add({
        type: "dataTotalMismatch",
        cat: "data",
        sev: "medium",
        facs: [fac],
        params: { factory: fac, count: mismatch.length, diff: mismatch.reduce((s, d) => s + Math.abs(num(d.Process_Quantity) - ngOf(d) - num(d.Total)), 0) },
        trend: null,
        compare: { unit: "", items: mismatch.slice(0, 6).map((d) => ({ label: d["背番号"], today: num(d.Total), normal: num(d.Process_Quantity) - ngOf(d) })) },
        rows: mismatch.map((d) => ({ cells: [d["背番号"], d.Worker_Name, qtyOf(d), ngOf(d), num(d.Total), num(d.Process_Quantity) - ngOf(d)], record: slim(d) })),
        columns: ["seban", "worker", "qty", "ng", "total", "expected"],
      });
    }
    const zero = list.filter((d) => qtyOf(d) > 0 && (durationMin(d) === 0 || num(d.Cycle_Time) === 0));
    const long = list.filter((d) => (durationMin(d) || 0) > 600);
    if (zero.length || long.length) {
      const bad = zero.concat(long);
      add({
        type: "dataTime",
        cat: "data",
        sev: "info",
        facs: [fac],
        params: { factory: fac, zero: zero.length, long: long.length, total: list.length, process: mode(bad.map((d) => d._proc)) },
        trend: null,
        compare: { unit: "", items: [{ label: "0 min", today: zero.length, normal: list.length }, { label: "> 10 h", today: long.length, normal: list.length }] },
        rows: bad.map((d) => ({ cells: [d["背番号"], d.Worker_Name, normalizeClock(d.Time_start), normalizeClock(d.Time_end), durationMin(d), qtyOf(d)], record: slim(d) })),
        columns: ["seban", "worker", "start", "end", "minutes", "qty"],
      });
    }
  }
  {
    const rows = [];
    const approvers = new Map();
    for (const [k, list] of groupBy(today, (d) => `${d["工場"]}|${d._proc}`)) {
      const [fac, proc] = k.split("|");
      const approved = list.filter((d) => d.approvalStatus && !/pending|reject/i.test(d.approvalStatus));
      approved.forEach((d) => {
        const who = d.hanchoApprovedBy || d.kachoApprovedBy || (d.approvalHistory || []).slice(-1)[0]?.user;
        if (who) approvers.set(who, (approvers.get(who) || 0) + 1);
      });
      rows.push({ fac, proc, approved: approved.length, waiting: list.length - approved.length });
    }
    const waiting = rows.reduce((s, r) => s + r.waiting, 0);
    if (waiting > 0) {
      rows.sort((a, b) => b.waiting - a.waiting);
      add({
        type: "dataApprovals",
        cat: "data",
        sev: "info",
        facs: [...new Set(rows.filter((r) => r.waiting).map((r) => r.fac))],
        params: { waiting, total: today.length, approved: today.length - waiting, approvers: [...approvers].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) },
        trend: null,
        compare: { unit: "", items: rows.slice(0, 8).map((r) => ({ label: `${r.fac} · ${r.proc}`, today: r.approved, normal: r.approved + r.waiting })) },
        rows: rows.map((r) => ({ cells: [r.fac, r.proc, r.approved, r.waiting] })),
        columns: ["factory", "process", "approved", "waiting"],
      });
    }
  }

  // ── I. flow ─────────────────────────────────────────────────────────────
  for (const [k, list] of groupBy(today, fpKey)) {
    const [fac, proc] = k.split("|");
    const fpAll = allFp.get(k) || [];
    const baseList = fpAll.filter((r) => r.Date < D);
    const nDays = new Set(baseList.map((r) => r.Date)).size;
    if (nDays < 5) continue;
    const t = list.reduce((s, r) => s + qtyOf(r), 0);
    const b = baseList.reduce((s, r) => s + qtyOf(r), 0) / nDays;
    if (b < 500) continue;
    const ratio = t / b;
    if (ratio < 1.5 && ratio > 0.5) continue;
    add({
      type: "flowOutput",
      cat: "flow",
      sev: "info",
      facs: [fac],
      params: { factory: fac, process: proc, today: t, base: Math.round(b), ratio: round(ratio, 2), records: list.length },
      trend: { unit: "", points: series(fpAll, (l) => l.reduce((s, r) => s + qtyOf(r), 0)) },
      compare: { unit: "", items: [{ label: `${fac} · ${proc}`, today: t, normal: Math.round(b) }] },
      rows: [...list].sort((a, b2) => qtyOf(b2) - qtyOf(a)).slice(0, 8).map((r) => ({ cells: [r["背番号"], r["設備"], r.Worker_Name, qtyOf(r)], record: slim(r) })),
      columns: ["seban", "machine", "worker", "qty"],
    });
  }
  {
    const inspected = new Set(today.filter((d) => d._proc === "kensa").map((d) => d["背番号"]));
    for (const [fac, list] of groupBy(today.filter((d) => d._proc === "press"), (d) => d["工場"])) {
      const items = [...groupBy(list, (d) => d["背番号"])]
        .map(([seban, recs]) => ({ seban, pressed: recs.reduce((s, r) => s + num(r.Total), 0), record: recs[0] }))
        .filter((x) => x.pressed >= 1000 && !inspected.has(x.seban))
        .sort((a, b) => b.pressed - a.pressed);
      const sum = items.reduce((s, x) => s + x.pressed, 0);
      if (sum < 10000) continue;
      add({
        type: "flowNotInspected",
        cat: "flow",
        sev: "info",
        facs: [fac],
        params: { factory: fac, count: items.length, pressed: sum, top: { seban: items[0].seban, pressed: items[0].pressed } },
        trend: null,
        compare: { unit: "", items: items.slice(0, 6).map((x) => ({ label: x.seban, today: x.pressed, normal: 0 })) },
        rows: items.map((x) => ({ cells: [x.seban, x.pressed, 0], record: slim(x.record) })),
        columns: ["seban", "pressed", "inspected"],
      });
    }
  }

  findings.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);

  // ── KPI tiles per factory (+ "All") ─────────────────────────────────────
  const kpiFor = (filterFn, stop) => {
    const recs = all.filter(filterFn);
    const processes = {};
    for (const p of PROCS) {
      const t = recs.filter((d) => d.Date === D && d._proc === p.key);
      if (!t.length) continue;
      const b = recs.filter((d) => d.Date < D && d._proc === p.key);
      const tp = pool(t);
      const bp = pool(b);
      processes[p.key] = { qty: tp.qty, rate: round(tp.rate), baseRate: round(bp.rate), baseQty: Math.round(bp.qty / activeDays(b)) };
    }
    return { records: recs.filter((d) => d.Date === D).length, processes, stopCalls: stop || null };
  };
  const kpis = { All: kpiFor(() => true, Object.keys(stopKpi).length ? Object.values(stopKpi).reduce((s, v) => ({ today: s.today + v.today, base: round(s.base + v.base, 1) }), { today: 0, base: 0 }) : null) };
  factories.forEach((f) => {
    kpis[f] = kpiFor((d) => d["工場"] === f, stopKpi[f]);
  });

  return {
    date: D,
    generatedAt: new Date().toISOString(),
    baselineFrom: FROM,
    days: trendDays,
    hasData: today.length > 0,
    factories: factories.filter((f) => today.some((d) => d["工場"] === f)),
    kpis,
    findings,
  };
}

// ─── route ───────────────────────────────────────────────────────────────────
function registerDailyReportRoutes(app, client) {
  const cache = new Map();

  app.get("/api/reports/daily", async (req, res) => {
    try {
      const raw = String(req.query.date || "");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : addDays(jstToday(), -1);
      const hit = cache.get(date);
      if (!req.query.refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json(hit.data);

      await client.connect();
      const data = await buildDailyReport(client.db("submittedDB"), date);
      cache.set(date, { at: Date.now(), data });
      if (cache.size > 40) cache.delete(cache.keys().next().value);
      res.json(data);
    } catch (error) {
      console.error("❌ Error in /api/reports/daily:", error);
      res.status(500).json({ error: "Failed to build daily report" });
    }
  });
}

module.exports = { registerDailyReportRoutes, buildDailyReport, normalizeClock };
