# SCNA box traceability + live cycle counts — plan & progress

Started 2026-10-22. Update the checkboxes and the change log at the bottom as phases land.
Related: `docs/scna-dcp-interactive-plan.md` (tablet), `ioT/pclistenerNC250324-SCNA.py` (machine-PC listener, port 5000),
`ioT/print_DBprinter.py` (print server, port 5001), `Kurachi/DCP interactive SCNA.js` (SCNA-only tablet add-on).

## 1. Goal

Every printed box gets a unique ID, so that later we can look the ID up and know:
how many pieces of which lot (lot 1 / lot 2 / spare lots) are in the box, who made it, on which machine(s),
what time, when it was printed, and which work order / run it belongs to.

Along the way: the tablet stops depending on the operator typing the shot count at every lot change
(live cycle count from the listener, operator only confirms), and process quantity becomes live.

## 2. Decisions (locked)

| # | Decision |
|---|---|
| D1 | Two levels of ID: **Run ID** (one per scan session / work order run, ends at data submission) and **Box ID** (one per printed box, belongs to a run). |
| D2 | A box is a **slice of production between two prints**: snapshot cumulative counts at each print, box = difference to the previous snapshot, split by machine and lot. |
| D3 | Box ID = `<work order>-B<seq>` (e.g. `WO-005460-B003`), serial issued by the **server** (atomic counter per work order). The tablet also makes a random `boxUid` up front so retries / reloads never create a second box (idempotent). |
| D4 | **No printing when the server is unreachable** (no temporary IDs, no offline queue, no aliases). |
| D5 | **Print = close the box.** After a successful print, the next Print press asks: *Reprint B003* or *New box B004*. Copies of one box share one Box ID. |
| D6 | Store **both** quantities per box: label `収容数` and the measured quantity (machine pieces + spare pieces). |
| D7 | Counts are **pieces produced** (good/NG not split per box). NG is counted only at the end of the run, so per-lot good quantity per box is not available. Accepted. |
| D8 | Live count source = listener `cycles_total` (never resets, saved to a file on the machine PC) read from `GET http://<machine PC>:5000/state`. Pieces = cycles × `pcPerCycle`. `cycleCountDB` (cloud copy) is only a last-resort fallback and marks the box approximate. |
| D9 | **Operator confirms the shot count at every lot change.** The tablet prefills the live number ("Auto count: 18"), operator taps **Confirm** or **Manual entry**. Legacy / offline listeners get today's plain keypad. |
| D10 | **SCNA only. Do not edit `DCP interactive backend.js`.** All tablet work is in `DCP interactive SCNA.js` (watches for the shared prompt and enhances it; if anything fails the plain prompt still works). Server changes are additive (`Kurachi/server.js`). |
| D11 | Listener declares itself in `/state` (`capabilities`, `cycles_total`, `cnc_online`) so tablets can tell new from legacy scripts. Presence of `cycles_completed` is **not** proof (older scripts also expose it). Decision is made per machine, at the moment of each lot change. |
| D12 | **Partial from spare**: press → enter quantity → enter lot number. Several entries allowed, removable before they are used. Entries are included in the **first box printed after they are added**, then flagged consumed so later boxes do not include them again. |
| D13 | Spare pieces are **separate from Process Quantity / Total** (those are what the machine produced). Spare was already recorded in an earlier pressDB, so it is not counted in this run's totals. Spares still appear as their own lines (source `spare`) in the box lot breakdown. |
| D14 | Only stored records for now. **No admin lookup UI yet** (later). |

## 3. Verified facts about the current system

- `pclistenerNC250324-SCNA.py`: `gatekeeper_state["cycles_completed"]` is in memory, +1 per finished cut, returned by `/state`
  (:5000 Flask and :8766 mirror). Reset to 0 daily 02:00 (only if idle >= 60 min and not cutting). On restart it reloads the
  last cloud value. `cycleCountDB` (`{factory, machine, timestamp, cycle}`) is a background copy (can lag/stale when offline).
  `display_state` becomes `CNC OFFLINE / UNREACHABLE` when the CNC link is down.
- `pclistenerNC250324.py` and `pclistenerNC250324-Kurachi.py` also expose `cycles_completed` (24 mentions each) → cannot be used to detect "new".
- The tablet (`DCP interactive backend.js`, `pollGatekeeperState`) already polls every machine PC `/state`. `machineStates` is private
  to that IIFE, so the SCNA file fetches `/state` itself (machine → IP via `groupedMachineIPs`).
- Lot shots are typed at lot change only (`promptShots` → `closeRecord`; the keypad modal is `#lpModal` with `#lpDisplay`, `#lpOk`).
  An open lot has no shots until closed. `Lot_Details` entries: `lotNumber, machine, shots, feedPitch, pcPerCycle, meters, pieces, timestamp, ...`.
- Print path: `DCP interactive SCNA.js` wraps `printLabel` → always `http://<printer IP>:5001/request` with `layoutId` and `overrides`
  (`SCNA.labelValues`). `print_DBprinter.py` already supports element-ID overrides, so `box_id` needs no print-server change.
- `/submitToDCP` stores the submitted body in pressDB (SCNA fields such as `WorkOrder_Info` already pass through). **To verify in Phase 4**
  that `Run_ID`, `Box_IDs`, `Spare_Lots` and the new lot fields are kept.
- A cut in progress physically prevents a lot change (material must be removed), so a lot change never happens mid-cycle.

## 4. Data model

### 4.1 Listener `/state` additions (both :5000 and :8766)
```
"capabilities": ["live_cycle_count_v1"],
"cycles_total": 12345,        // monotonic, persisted to a local file, never reset by 02:00 / restart
"cnc_online": true            // false when display_state is CNC OFFLINE / UNREACHABLE
```

### 4.2 Run (tablet, localStorage, SCNA prefix) — created at Step 1 scan / WO pick, cleared at submit
```
{ runId, workOrderNumber, 背番号, startedAt, boxSeqHint,
  lastSnapshot: { at, perMachine: { "AOL-2": { cyclesTotal, lotNumber } , ... } },
  lotMarks: [ { machine, lotNumber, cyclesTotalAtStart, at, source } ],
  spareEntries: [ { id, lotNumber, pieces, at, worker, consumedByBoxUid|null } ],
  pendingBox: { boxUid, payload }|null, lastPrinted: { boxId, boxUid }|null }
```

### 4.3 Box record — new collection `scnaBoxDB` (Sasaki_Coating_MasterDB)
```
{ boxId: "WO-005460-B003", boxUid, seq, runId, workOrderNumber,
  factory:"SCNA", 背番号, 品番, machines:["AOL-2","AOL-3"], Tablet_Home, worker,
  startedAt, finishedAt, printedAt, printedBy:{ tablet, printerIP }, copies, layoutId,
  qtyLabel,            // 収容数 shown on the label
  qtyMeasured,         // machine pieces + spare pieces
  lots: [ { source:"machine", lotNumber, machine, shots, pieces, countSource:"auto|manual|cloud" },
          { source:"spare",   lotNumber, pieces } ],
  snapshot: { ... cumulative counts used for the next difference ... },
  approximate: false, notes: [], pressId: null, createdAt }
```
Unique index on `boxUid`; unique index on `boxId`. Counter collection `scnaBoxCounters` `{ _id: <work order or run key>, seq }`.

### 4.3.1 Key for runs without a work order
Assumption (confirm in Phase 4): prefix = work order number; if none, `<背番号>-<YYYYMMDD>`.

### 4.4 pressDB additions (via the existing SCNA `patchSubmit`)
`Run_ID`, `Box_IDs: [...]`, `Spare_Lots: [{ lotNumber, pieces, at, worker }]`, and per `Lot_Details` entry:
`shotsAuto`, `countSource` (`auto-confirmed | manual | cloud`), `cyclesTotalStart`, `cyclesTotalEnd`.
`Process_Quantity`, `Total`, `Total_Pieces` stay machine-production only. `スペアからの部分数` remains for compatibility (verify downstream reports).

## 5. Rules

- **Auto vs manual, per machine, per lot change:** fetch `/state` fresh; auto only if `capabilities` has `live_cycle_count_v1`, `cnc_online` is true and
  `cycles_total` is a number. A lot closes automatically only if its start AND end were auto readings; otherwise the plain keypad is used.
  If `cycles_total` ever drops below a lot's start, treat that lot as manual.
- **Shots prompt (D9):** value shown = `(cycles_total_now - cyclesTotalStart)`. Each saved lot keeps confirmed shots, the offered auto value, and the source.
  The first lot's start is captured when the lot is entered via the SCNA keypad; afterwards each confirmation is the end of the old lot and the start of the next.
- **Live Process Quantity:** closed lots' pieces + (cycles now − start of open lot) × `pcPerCycle`, refreshed from the `/state` poll.
- **Box snapshot at print:** per machine, cumulative cycles now vs `lastSnapshot` → cycles per lot between them (split at lot boundaries) × `pcPerCycle`;
  plus unconsumed spare entries. If a machine has no trusted count: fall back to cloud count and set `approximate`; if none, save the box without a lot
  breakdown, flagged. Printing itself is only blocked by an unreachable **Kurachi server** (D4).
- **Spare (D12/D13):** included once, in the next box created after it was added; flagged `consumedByBoxUid` when the server accepted that box.

## 6. Phases

### Phase 0 — Plan and decisions
- [x] Requirements discussed, decisions D1–D14 locked (2026-10-22)
- [x] This plan written

### Phase 1 — Listener (`ioT/pclistenerNC250324-SCNA.py`)
- [x] `cycles_total`: monotonic counter, +1 wherever `cycles_completed` is incremented, saved to a local file (atomic write), restored on start
- [x] Never reset by the 02:00 reset or restart; define what happens if the file is missing (start from `cycles_completed`) and log it
- [x] `/state` (Flask :5000) and the :8766 mirror return `capabilities`, `cycles_total`, `cnc_online`
- [x] SSE `cycle_completed` also carries `cycles_total`
- [ ] Test on a machine PC: restart the script, 02:00 reset (simulate), CNC offline → `cnc_online=false`
- Deploy: per machine PC (redeploy listener). Until then that machine stays manual.

### Phase 2 — Tablet auto counts (`DCP interactive SCNA.js` only)
- [x] Count service: machine → IP, fetch `/state`, capability check, per-machine mode (auto / manual), small indicator "Auto count / Manual count"
- [x] Record `cyclesTotalStart` when a lot is entered with the SCNA keypad (per target machine)
- [x] Watch for the shots prompt (`#lpModal`): prefill auto value, **Confirm** / **Manual entry**, record offered vs confirmed + source (fail-safe: plain prompt on any error)
- [x] Join `shotsAuto`, `countSource`, `cyclesTotal*` into the submit payload (`patchSubmit`)
- [ ] Live Process Quantity (poll-based)
- [ ] Test matrix: new+new pair, new+legacy pair, listener down at lot change, CNC offline, page reload mid-lot

### Phase 3 — Partial from spare
- [x] Replace the number box with the flow: quantity keypad → lot-number keypad → entry saved in the run (localStorage)
- [x] List with remove (only unconsumed entries); sum feeds the legacy `スペアからの部分数`
- [x] `Spare_Lots` in the submit payload; totals unchanged (D13)
- [ ] Test: several entries, reload, remove, entry after the first box is printed (goes to the next box)

### Phase 4 — Server (`Kurachi/server.js`, additive)
- [x] Verify `/submitToDCP` keeps `Run_ID`, `Box_IDs`, `Spare_Lots`, new lot fields
- [x] `scnaBoxCounters` + `scnaBoxDB`, unique indexes (`boxUid`, `boxId`)
- [x] `POST /api/scna-boxes` (idempotent on `boxUid`, returns `boxId`), `GET /api/scna-boxes/:boxId`, `GET /api/scna-boxes?runId=`
- [x] Decide prefix for runs without a work order (see 4.3.1)
- [ ] Deploy `server.js` before any tablet change that calls it

### Phase 5 — Tablet run + box flow (`DCP interactive SCNA.js`)
- [x] `runId` created at scan start, persisted, cleared at submit (D1)
- [x] Print press: block if server unreachable → (reprint / new box prompt) → snapshot difference → `POST /api/scna-boxes` → `SCNA.boxId = boxId` → print (the tablet sends override `qr_1` = `{品番},{収容数},{lotNumber},<boxId>`; the layout itself stays `{品番},{収容数},{lotNumber}`; the print server fills the `{fields}` in overrides)
- [x] After the server accepts the box: mark spare entries consumed, store `lastPrinted`
- [x] Retry safety: same `boxUid` and stored payload after failure / reload
- [x] `Run_ID` + `Box_IDs` added to the submit payload
- [ ] Test: 3-box scenario (lot 1 only → lot 1+2 → lot 2 only), spare in box 1, reprint, reload between boxes, server down at print

### Phase 6 — Labels, rollout, wrap-up
- [ ] Admin (manual): on the real layouts keep `qr_1` = `{品番},{収容数},{lotNumber}` (tablet appends the box ID); optionally add a text element with Element ID `box_id` for a readable box ID (tablet now sends it automatically; layouts without it ignore it)
- [ ] Pilot on one machine, compare `shotsAuto` vs confirmed values for a couple of weeks
- [ ] Roll out per machine (redeploy listener, hard-refresh tablet)
- [ ] Later: admin lookup UI (type / scan a box ID → box, lots, worker, machine, times, linked pressDB)

## 7. Deploy order

1. `Kurachi/server.js` (additive endpoints; safe before tablets use them)
2. Listener on one machine PC (Phase 1) → verify `/state`
3. `DCP interactive SCNA.js` (publish + hard-refresh the tablet)
4. Label layouts with `box_id`
5. Repeat 2–3 per machine

## 8. Risks / watch list

- Listener count vs the machine's own "cur times": confirm with the logged `shotsAuto` vs confirmed values (Phase 6 pilot).
- Test / first-piece cuts are counted as cycles (same as Process Quantity today).
- Listener restart without the `cycles_total` file → counter restarts; detected as a drop → lot falls back to manual.
- The shots-prompt enhancement depends on the shared modal's element ids (`lpModal`, `lpDisplay`, `lpOk`); if the shared page changes, it degrades to the plain prompt.
- `スペアからの部分数` consumers (reports) must still receive the sum.
- Pair machines run in parallel with their own lots; a box spans both. Mixed new/legacy pairs → that box is approximate for the legacy machine.

## 9. Change log

| Date | Phase | Note |
|---|---|---|
| 2026-10-22 | 0 | Plan created, decisions D1–D14 agreed |
| 2026-10-22 | 1 | Listener: `cycles_total` (file `cycles_total_<machine>.json`), `cnc_online`, `capabilities` in `/state` (:5000/:8766) and SSE status; `cycle_completed` carries `cycles_total`. Helper logic unit-tested; CNC-offline and 02:00 paths not run on a real machine (test box still open). |
| 2026-10-22 | 2 | `DCP interactive SCNA.js` section 10e: `fetchCycleState` (:5000 then :8766, capability + `cnc_online` check), `markLotStart` at keypad lot entry, shots-prompt banner (Confirm / Manual entry) via MutationObserver on `#lpModal`, `Lot_Details` gets `shotsAuto/countSource/cyclesTotalStart/End`, badge "Auto count / Manual count". Marks cleared on reset. Syntax-checked only; live Process Quantity and the test matrix still open. Listener capability string aligned to `live_cycle_count_v1`. |
| 2026-10-22 | 3 | Partial from spare: the field opens a manager (list, ✕ on unconsumed entries, ＋ Add = quantity keypad → lot keypad, own overlay keypad so the page's fields are untouched). Entries in localStorage `scnaSpareEntries`; field + `スペアからの部分数` = their sum; `Spare_Lots` in the submit payload; Process Quantity/Total untouched. Helpers for Phase 5: `SCNA.pendingSpare()`, `SCNA.consumeSpare(ids, boxUid)`. Syntax-checked only; the "goes into the next box" part is wired in Phase 5. |
| 2026-10-22 | 4 | `server.js` (additive, not deployed): `/submitToDCP` already spreads `formData` and each `Lot_Details` entry into pressDB, so `Run_ID`, `Box_IDs`, `Spare_Lots` and the new lot fields are kept with no change. New `POST /api/scna-boxes` (idempotent on `boxUid`, issues `<key>-B<seq>` from `scnaBoxCounters`), `GET /api/scna-boxes/:boxId`, `GET /api/scna-boxes?runId=`; unique indexes on `boxUid` and `boxId` created on first use. Key = work order number, else `<背番号>-<YYYYMMDD>` (JST) (4.3.1 assumption adopted). Syntax-checked; not run against Mongo. |
| 2026-10-22 | 5 | `DCP interactive SCNA.js` section 10f: `getRun` (runId at first lot entry, key `scnaRun`, cleared on Reset), `buildBoxPayload` (per machine cycles_total difference split by lot + unused spare; unknown counts => `approximate`, lot listed without pieces), `prepareBox` (Reprint/New prompt after a box, POST with stored payload + `boxUid`, snapshot advanced and spare consumed only after the server accepted, no print if the server is unreachable), `SCNA.boxId` => `qr_1` override, `Run_ID`/`Box_IDs` in the submit. Box counts fall back to approximate (no cloud `cycleCountDB` fallback yet). Syntax-checked + slice math checked; not run on a tablet. |
| 2026-10-22 | 6 | Tablet sends override `box_id` = box ID with every print (a text element with that Element ID shows it). Remaining Phase 6 items are on-site: layout edit in admin, pilot, rollout, later lookup UI. |
