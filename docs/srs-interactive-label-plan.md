# SRS interactive (Girasol) — SRS WIP label + piece-level traceability — plan

Started 2026-10-27. Update the checkboxes and the change log at the bottom as phases land.
Related: `docs/scna-box-traceability-plan.md` (DCP box IDs this builds on), `SRS interactive.html`,
`SRS interactive SCNA.js`, `SRS interactive i18n.js`, `server.js` (`/submitToSRSDBInteractive`, `/api/scna-boxes`),
`ioT/print_DBprinter.py` (print server :5001, process `SRS` already supported).

## 1. Goal

Every printed SRS label gets a unique **SRS ID** (e.g. `WO-005460-S001`). Scanning it (later, in inspection / logistics /
棚卸し — those systems do not exist yet) must show everything: who ran SRS, on which Girasol, when, which press
boxes (and so which press lots, AOL machines, workers) the pieces came from, and how many pieces of each.

## 2. Decisions (locked 2026-10-27)

| # | Decision |
|---|---|
| S1 | One printed label = one **SRS box**, ID `<WO>-S<seq>` (server-issued, atomic counter, idempotent on a client `boxUid`, same idea as DCP D3). `S` keeps it apart from DCP `B` IDs. |
| S2 | An SRS box can mix pieces from **2+ press box IDs** (or legacy 品番+lot) so it reaches the standard 収容数 after NG/discards. Every contributing box ID is recorded with its piece count. |
| S3 | **Print = complete box**: label quantity = standard 収容数 (masterDB). A separate **"incomplete box" print** makes a **draft** label: quantity = sum of the pieces the user entered. If the entered/measured total differs from 収容数 on a complete print: warn first, user chooses *make it a draft* or *print 収容数 anyway*. Measured quantity is always stored too (like DCP D6). |
| S4 | **Resuming a draft**: the user scans the draft SRS label (after the WO). A **new SRS ID** is issued whose `parent` is the draft's ID; the carried lines come across (flagged `carried`, not counted again) and the new print **replaces** the old label physically. The old draft is marked `superseded`. |
| S5 | **Press box IDs can be scanned multiple times.** Pieces left over in a press box stay "remaining" (base = `qtyMeasured`, fallback `qtyLabel`). A box is blocked on scan only when nothing remains. Legacy boxes have no ID, so their leftovers cannot be tracked across sessions (a legacy QR is the full quantity once per lane; an exact repeat in a lane is still blocked). |
| S6 | **NG** is recorded **per input** (press box ID, or 品番+lot for legacy), per NG type, with the same six counters as SRS Process iReporter: ① くっつき・めくれ ② シワ ③ 転写位置ズレ ④ 転写不良 ⑤ 文字欠け, その他. |
| S7 | **Like DCP: shown NG resets after a print, the real total is kept.** While working the user taps the counters. A print attaches the NG entered so far to that label; the screen then shows 0 and counting continues. The hidden running total is what is submitted. |
| S8 | **Submit needs at least one printed label** (complete or draft) for the lane. Without one, a **leader QR** (`/verifyLeader`) is required; the leader is recorded in the SRSDB record. Print state persists in the lane draft across reloads; released only on submit / reset. |
| S9 | **Resetting a lane that has printed labels needs a leader QR.** Those labels stay registered, marked `voided` (reason `reset`, leader). |
| S10 | SRSDB keeps every legacy field **as-is**; new fields are added (Lot_Details like pressDB, SRS box IDs, Box_IDs, WorkOrders, bypass/leader). One SRSDB record per lane submit (unchanged); a draft finished the next day means the same chain appears in two records. |
| S11 | **Printer**: one printer per Girasol tablet. IP from the same Google-sheet lookup as AOL (`ipURL ?filter=<machine>`), name = the tablet's machine name exactly (`Girasol-1` / `Girasol-2`). Print goes to `http://<ip>:5001/request` with `process=SRS`. |
| S12 | **Layout**: an SRS layout is designed in the Label Designer (process `SRS`). Layouts via `/api/scna-label-layouts/for-item?sebanggo=&process=SRS`. None found → alert **"no layout found, call leader"** and no ID is issued. No printing when the server is unreachable (like DCP D4). |
| S13 | Do **not** touch production routes or pages: `/submitToSRSDBiReporter`, SRS Process iReporter, DCP interactive backend. All server work is additive, in new routes. |
| S14 | Label elements: `qr_1` = `{品番},<qty>,{lotNumber},<SRS ID>`; `box_id` = SRS ID; `text_9` = `{lotNumber} - <SRS ID>` (as DCP); `text_6` = quantity (**assumed**, layout not final); `text_10` = draft marker (e.g. 仮 / DRAFT), only sent for drafts. |

## 3. Data model

### 3.1 `srsBoxDB` (new collection, Sasaki_Coating_MasterDB) — the SRS box / label registry
```
{ srsId: "WO-005460-S002", boxUid, seq, factory:"SCNA", status: "complete|draft|superseded|voided",
  workOrder, 背番号, 品番, machine:"Girasol-1", lane:"LH|RH", workers,
  qtyLabel,            // what the label shows: 収容数 (complete) or the draft quantity
  qtyMeasured,         // sum of good pieces from the lines (non-carried + carried)
  lines: [ { boxId|null, legacy, 品番, lotNumber(s), machine(s) of press, carried:false|true,
             good, ng:{ くっつき・めくれ, シワ, 転写位置ズレ, 転写不良, 文字欠け, その他 }, ngTotal } ],
  parent: srsId|null, replacedBy: srsId|null,
  printedAt, printedBy:{ tablet, printerIP }, copies, layoutId,
  srsRecordId: null,   // SRSDB _id, filled at submit
  void: { at, reason, leader } | null, createdAt }
```
Unique indexes on `srsId` and `boxUid`. Counter in `scnaBoxCounters` with key `<WO>-S` (separate from the DCP `<WO>` counter).

### 3.2 `scnaBoxDB` (existing press boxes) — consumption
`srsConsumed: [ { srsId, good, ng, at } ]` pushed when a label is registered (and when leftover NG is posted at submit).
Remaining = (`qtyMeasured` ?? `qtyLabel`) − Σ(good + ng) over entries whose SRS box is not `voided`. Carried lines never add entries.
Also `srs` (last result, written at submit — already implemented in `/submitToSRSDBInteractive`).

### 3.3 SRSDB record (new fields only; all legacy fields unchanged)
`Srs_Box_IDs: [srsId…]`, `Box_IDs: [press box IDs…]`, `WorkOrders`, `WorkOrder_Info`, `Box_Scans`,
`Lot_Details: [ { srsId, boxId|null, legacy, 品番, lotNumber, pieces(good), ng:{…}, ngTotal, carried } ]`,
`Srs_Label_Bypass: { leader… } | null`. `Total` = good pieces made **this session**, `Process_Quantity` = good + NG this session
(carried pieces are listed in Lot_Details but not counted again). `SRS_Total_NG` and the six NG fields = this session's totals.

## 4. Flows

1. **Scan tab** (as built): WO first, then press box QRs (new and legacy). A box with remaining pieces is accepted again; show remaining.
   A scanned **SRS label** (`-S###`, 4-part QR) is recognised: not accepted as a press box; on the Scan tab it offers *resume draft* if it is a draft whose 品番 matches a lane with a WO, else a clear message.
2. **Production tab, per lane**: input chips (each scanned press box / legacy lot with remaining pieces); one is **current**.
   The six defect counter buttons (iReporter names, `+ / −`) count against the current input. Shown NG = NG since the last print; hidden total kept.
3. **Print** (two buttons per lane: *SRS ラベル印刷* = complete, *未完成箱として印刷* = draft):
   dialog with quantity (complete = 収容数, fixed; draft = typed), allocation lines per input (auto-filled oldest-first, editable, total must equal the label quantity), NG attached from the counters. Mismatch on complete → warning with *draft* / *print 収容数 anyway*.
   Steps: layout check (S12) → `POST /api/srs-boxes` (issue ID, register lines, post consumption) → print request to the printer → on success the lane stores `printed:[…]`, shown NG resets to 0. Print failure after the ID was issued → *Reprint* with the same ID.
4. **Reprint** keeps the ID and lines (no new consumption).
5. **Resume draft**: see S4. Carried lines locked; the user only allocates the rest.
6. **Submit**: check S8 (leader QR if no printed label), then `/submitToSRSDBInteractive` with the new fields; server links each SRS box (`srsRecordId`), posts leftover NG consumption, writes back to press boxes.
7. **Reset** with printed labels: leader QR, labels `voided` (S9).

## 5. Server (all additive, `server.js`)
- `POST /api/srs-boxes` (idempotent on `boxUid`): checks everything read-only first (so a refused request does not burn an ID), issues the ID, claims the parent draft, takes the pieces from each press box (optimistic concurrency, rolled back on failure), stores the SRS box. A draft's `qtyLabel` must equal the sum of its lines; a complete label may differ (flagged `mismatch`).
- `GET /api/srs-boxes/:srsId` (+ `?chain=1` expands parent drafts, press boxes, SRSDB records).
- `GET /api/srs-press-boxes/:boxId`: the press box with `base`, `consumed`, `remaining` (what the tablet scans in Phase 2).
- `POST /api/srs-boxes/:srsId/void` (body `{reason, leader:{username,name}}`; refused once the box is in an SRSDB record; gives pieces back; reopens a draft it replaced).
- `/submitToSRSDBInteractive`: validates `Srs_Box_IDs` (exist, complete/draft, not linked), links `srsRecordId`, posts leftover NG (`Srs_Unlabelled_NG`), `Submit_UID` makes a retry return the saved record, press boxes get `srs` (latest) + `srsRuns` (all). The tablet scan check (Phase 2) changes from "already submitted" to "remaining > 0".
- `GET /api/scna-boxes/:boxId` stays as is (DCP route); remaining is computed from `srsConsumed` in a new SRS-side endpoint or in the tablet from the box document.

## 6. Phases

### Phase 0 — Plan
- [x] Requirements and decisions S1–S14 (2026-10-27)
- [x] This plan

### Phase 1 — Server
- [x] `srsBoxDB` + counters + indexes, `POST/GET /api/srs-boxes`, `POST /api/srs-boxes/:srsId/void`, `GET /api/srs-press-boxes/:boxId` (2026-10-27)
- [x] `srsConsumed` + remaining; `/submitToSRSDBInteractive` accepts `Srs_Box_IDs`, `Submit_UID`, `Srs_Unlabelled_NG`; the once-only 409 now applies only to the old whole-box flow (no `Srs_Box_IDs`)
- [x] Mock tests (in-memory fake Mongo, 36 checks: idempotency, remaining math, over-consumption + rollback, draft → complete chain, supersede/void/revert, submit linking, retry safety, old flow unchanged) — **not yet run against a real MongoDB**

### Phase 2 — Tablet scan and counters
- [ ] Input chips with remaining; accept boxes with remaining > 0
- [ ] Per-input defect counters (iReporter names), shown vs hidden NG
- [ ] Recognise SRS labels on scan (reject as press box; resume path stub)

### Phase 3 — Print
- [ ] Printer IP from the Google sheet (`ipURL`, machine name), layout check, "no layout found, call leader"
- [ ] Print dialog: complete / draft, allocation, mismatch warning, overrides (S14)
- [ ] Persisted `printed` state; reprint

### Phase 4 — Draft resume, submit guard, reset guard
- [ ] Scan draft label → carried lines, new ID with `parent`, old → `superseded`
- [ ] Submit without a printed label → leader QR, stored in the record
- [ ] Reset with printed labels → leader QR, void

### Phase 5 — Test on the real tablet / printer / server (nothing is verified until then)

## 7. Risks / not decided
- Legacy leftovers are not tracked (no ID).
- Label layout element IDs are not final (`text_6` quantity is an assumption).
- The next-process scanner does not exist; the ID format `-S###` is the contract it will have to read.
- Admin lookup UI (extend `ScnaBoxLookupModal` / `temp-box-lookup.html` to SRS IDs) is a later job.

## 8. Change log
| Date | Phase | Change |
|---|---|---|
| 2026-10-27 | 0 | Plan written; decisions S1–S14 locked after 4 rounds of questions |
| 2026-10-27 | 1 | Server routes + submit changes in `server.js`; fake-Mongo tests pass (36/36). IDs are not burned by refused requests. Not run against real MongoDB; not committed. |
