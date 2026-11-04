# Kensa interactive (SCNA inspection) — plan

Started 2026-10-27. PLAN ONLY — nothing built. Tick boxes and fill the change log as phases land.
Modelled on: `SRS interactive SCNA.js` / `SRS interactive.html` / `docs/srs-interactive-label-plan.md` (box IDs, remaining, print, drafts, leader guards)
and `DCP interactive SCNA.js` (info sidebar, 初物 photo, maintenance, call leader).
Existing 検査 (not touched): `newKensa iReporter.html` + `newKensa iReporter backend.js` -> `/submitToKensaDBiReporter` -> `kensaDB`.

## 1. Goal

A tablet page at an inspection table (`?filter=SCNA&machine=IT1` / `IT2`). The worker scans incoming boxes directly (no work order),
inspects, counts NG with the usual 12 counters, and prints Kensa labels. Every Kensa label gets a **Kensa ID**
that links back to every input (DCP box ID, SRS ID, or legacy 品番+lot) and its pieces, so a later process can scan one label and trace everything.

## 2. Decisions (from the 2026-10-27 Q&A)

| # | Decision |
|---|---|
| K1 | **One bench per tablet** (IT1, IT2 = inspection table). No LH/RH lanes. One current product (品番) per session. Link `?filter=SCNA&machine=IT1`. |
| K2 | **No work order.** The first box scan sets the 品番 -> masterDB gives 背番号 (and the standard 収容数). Later scans must have the same 品番 (a different one is refused; finish/reset first). |
| K3 | **Inputs** = scans of: legacy QR `品番,qty,lot`; DCP press box `品番,qty,lot,<key>-B###`; SRS label `…-S###` (4-part QR). A Kensa label (`-K###`) is **rejected for now** (re-inspection later, see `saiKensa.html`). |
| K4 | **Kensa box = one printed label**, ID `<key>-K<seq>`. With no WO the key is `<背番号>-<yyyymmdd>` (JST), the same fallback `_scnaBoxKey()` already uses, e.g. `ABC123-20261027-K001`. Server-issued, atomic counter (`scnaBoxCounters`, key `<key>-K`), idempotent on a client `boxUid`. |
| K5 | **Mixing like SRS**: a Kensa box can mix pieces from 2+ inputs to reach 収容数 after NG; every contributing ID/lot + piece count is recorded. **Complete print** = label qty 収容数 (warn on mismatch: make it a draft / print 収容数 anyway). **Draft print** = typed qty (= sum of entered lines), marker `text_10`. Draft resume next day = new K-ID with `parent`, old draft `superseded`. |
| K6 | **Remaining**: any ID'd input (DCP / SRS) can be scanned again until nothing remains (partial use). Legacy QR = full qty once per session, exact repeat blocked; leftovers not tracked across sessions. |
| K7 | **NG = the 12 counters of newKensa iReporter** (`counter-1..12`, same names/order as that page), counted **per input**. Shown NG resets to 0 after a print, the real total is kept and submitted (as DCP/SRS). Only good + NG (no rework/hold). |
| K8 | **初物 (first-piece) photo required** before inspection can be submitted, same mechanism as DCP interactive SCNA (IndexedDB blob, `hatsumono*` flow, TRUE/FALSE). OPEN: is 終物 (last-piece) also required? (assumed NO — the user said "first check"). |
| K9 | **Submit** to a NEW additive route `/submitToKensaDBInteractive` (never touch `/submitToKensaDBiReporter`). Writes `kensaDB` with all legacy fields as-is (品番, 背番号, 工場, Total, Worker_Name, Process_Quantity, Remaining_Quantity, Date, Time_start/end, 設備=IT1, Counters, Total_NG, Cycle_Time, 製造ロット, Comment, Spare) + new: `Kensa_Box_IDs`, `Box_IDs`, `Lot_Details`, `Submit_UID`, leader/bypass. Dashboards keep working. |
| K10 | **Label guards like SRS**: submit needs >= 1 printed label else a leader QR (recorded); reset with printed labels needs leader QR and voids them. |
| K11 | **Printer**: one per tablet, IP from the same Google-sheet lookup (`ipURL ?filter=<machine>`), name = `IT1`/`IT2` exactly. Print to `http://<ip>:5001/request`, `process=KENSA`. Needs a `KENSA` process added in `ioT/print_DBprinter.py` (it supports `SRS`) — check, additive only. |
| K12 | **Layout**: own layout in the Label Designer (process `KENSA`) via `/api/scna-label-layouts/for-item?sebanggo=&process=KENSA`. None -> "no layout found, call leader", no ID issued. Offline -> no printing. Elements assumed: `qr_1` = `品番,qty,lot,K-ID`, `box_id`, `text_9` = `lot - K-ID`, `text_6` = qty (assumed), `text_10` = draft marker. |
| K13 | **Parity** with DCP/SRS interactive: worker step, break timer, maintenance, call leader (hold 2s, `/verifyLeader`, `/api/stop-call`), `i` sidebar, ja/en/pt, factory TV tiles IT1/IT2 + `/api/machine-assert`. |
| K14 | **Never touch production**: `newKensa iReporter*`, `/submitToKensaDBiReporter`, DCP interactive backend, SRS routes. All work in NEW files + additive server routes. |

## 3. Data model

### 3.1 `kensaBoxDB` (new, Sasaki_Coating_MasterDB)
```
{ kensaId:"ABC123-20261027-K001", boxUid, seq, factory:"SCNA", status:"complete|draft|superseded|voided",
  背番号, 品番, machine:"IT1", workers,
  qtyLabel, qtyMeasured,
  lines:[{ boxId|null, srsId|null, legacy, 品番, lotNumber(s), carried, good, ng:{counter-1..12}, ngTotal }],
  parent, replacedBy, printedAt, printedBy:{tablet,printerIP}, copies, layoutId,
  kensaRecordId:null, void:{at,reason,leader}|null, createdAt }
```
Unique indexes on `kensaId`, `boxUid`.

### 3.2 Consumption of inputs
Input being a DCP box (`scnaBoxDB`) or SRS box (`srsBoxDB`): push `kensaConsumed:[{kensaId,good,ng,at}]`; remaining = base − Σ(good+ng) of non-voided entries (same rule as `srsConsumed`). Press/SRS records also get `kensa` (latest) at submit.

### 3.3 Reading a DCP vs SRS input
Scan `…-B###` -> `/api/scna-boxes/:id` (+ remaining incl. SRS use). Scan `…-S###` -> `/api/srs-boxes/:id` (status complete/draft, remaining). The server should expose one `GET /api/kensa-inputs/:id` that resolves either kind and returns `{kind, 品番, lots, base, consumed, remaining}`.
OPEN: a DCP box already consumed into an SRS box — can it also go to Kensa? (assumed: only while remaining > 0, shared pool).

## 4. Flows
1. **Scan tab**: worker step, then scan boxes (legacy / DCP / SRS). First scan fixes 品番 + 背番号 + 収容数; chips show each input with remaining.
2. **初物 photo**: required before submit (K8). Reuse DCP hatsumono capture + IndexedDB preview.
3. **Inspect tab**: 12 counters against the current input (+/−), shown vs real NG.
4. **Print** (complete / draft buttons): dialog with qty, allocation per input (oldest first, editable, sum = label qty), NG attached from counters; layout check -> `POST /api/kensa-boxes` -> printer request -> persist `printed:[…]`, shown NG -> 0. Reprint keeps the same ID.
5. **Resume draft**: scan a draft K label -> carried lines, new ID with parent.
6. **Submit**: 初物 check, printed-label check (leader QR otherwise), `/submitToKensaDBInteractive` (photos uploaded like DCP/newKensa route; `Submit_UID` retry-safe).
7. **Reset**: leader QR if labels printed; void them.
8. Draft state in localStorage across reloads.

## 5. Server (additive, `server.js` — new section `// ==== KENSA BOXES START/END`)
`POST/GET /api/kensa-boxes`, `GET /api/kensa-boxes/:id?chain=1`, `POST /api/kensa-boxes/:id/void`, `GET /api/kensa-inputs/:id`, `/submitToKensaDBInteractive`. Check everything read-only before burning an ID; optimistic concurrency on input consumption with rollback (same patterns as `/api/srs-boxes`).

## 6. Phases and the 3 agents
Agents work on disjoint files; agent C also reviews A+B for consistency.
- **Agent A — server** (`server.js` section only, `ioT/print_DBprinter.py` KENSA check): Phase 1 + server part of Phase 5 on a temporary mongod (parallel-race tests like SRS).
- **Agent B — tablet logic** (`Kensa interactive SCNA.js`, new): scan parsers (legacy/DCP/SRS/K-reject), inputs + remaining, 12 counters per input, 初物 photo gate, print/draft/resume/leader/reset, draft persistence, submit payload.
- **Agent C — page, i18n, TV, docs** (`Kensa interactive.html`, `Kensa interactive i18n.js`, `factory-stopcall-tv.html` IT tiles): layout of Scan/Inspect tabs, sidebar, language, maintenance/call leader UI; ticks this doc; headless mocked-fetch tests of the page together with B's JS.
Order: A defines the API contract first (section 5 + payloads) -> B and C build against it in parallel.

### Phase 0 — Plan
- [x] Requirements K1–K14 (2026-10-27)
### Phase 1 — Server (A)
- [x] `kensaBoxDB`, counters, indexes, routes, `kensaConsumed` (2026-10-27, server.js `// ==== KENSA BOXES START/END`)
- [x] `/submitToKensaDBInteractive` (+ photos, `Submit_UID`, linking) (2026-10-27)
### Phase 2 — Tablet scan + counters (B, C)
- [x] inputs/remaining, 12 counters per input, 初物 gate (B JS done + headless-tested 2026-10-27)
### Phase 3 — Print (B, C)
- [x] printer IP, layout check, dialog, reprint (B JS done + headless-tested)
### Phase 4 — Draft resume, submit/reset guards (B) — [x] JS done + headless-tested
### Phase 5 — Tests
- [x] Server on real temporary mongod (2026-10-27, 60 checks pass; see change log)
- [x] Headless page tests with mocked fetch (ja + en; scan, counters, 初物, print complete/draft, submit)
- [ ] Real tablet + camera + IT printer + KENSA layout in Label Designer (needs the user)

## 7. Open / assumptions to confirm
1. 終物 photo required too? (assumed no)
2. Shared pool: a DCP box partly used by SRS can also feed Kensa while remaining > 0? (assumed yes)
3. Kensa ID key `<背番号>-<yyyymmdd>-K###` (no WO). OK?
4. Photos: where do they go — same Drive/Firebase path as `newKensa`/DCP submit (assumed same helper).
5. `KENSA` process support in the print server and Label Designer (to verify).
6. Kensa label elements (`text_6` etc.) provisional until the layout is final.
7. Next-process scanner and admin lookup UI for K-IDs: later.

## 10. API contract (server, as built 2026-10-27)
All in `server.js` section `// ==== KENSA BOXES START/END`. Errors are `{error, ...}` with 400 (bad body), 404, 409 (refused: over-consumption, wrong product, not usable, already linked), 500.
- `POST /api/kensa-boxes` body `{boxUid(8-64 [A-Za-z0-9_-]), 背番号, 品番, machine, workers, status:'complete'|'draft', qtyLabel, lines:[{boxId|null, srsId|null, legacy, 品番, lotNumber, carried, good, ng:{'counter-1'..'counter-12'}, ngTotal}], parentKensaId|null, layoutId, printedBy:{tablet,printerIP}, copies, printedAt?}`. `boxId` must be `...-B###`, `srsId` `...-S###`; a legacy line (neither) needs `lotNumber`. `ngTotal` is recomputed server-side from `ng`. Returns 201 doc `{kensaId:'<背番号>-<yyyymmdd JST>-K###', status, qtyLabel, qtyMeasured(=sum good), mismatch, lines, parentKensaId, replacedBy:null, kensaRecordId:null, ...}`; same `boxUid` again returns `200 {..., existing:true}`. Draft: `qtyLabel` must equal sum of all line `good` (carried included). Complete: may differ (`mismatch:true`). Carried lines are not consumed again; `parentKensaId` and carried lines go together. Same input twice among new lines (or among carried lines) is 400. A 409 for over-consumption carries `{id, remaining, need}`; refused requests never burn a number.
- `GET /api/kensa-boxes/:kensaId[?chain=1]` -> the doc; chain adds `{box, parents[], pressBoxes[], srsBoxes[], kensaRecords[]}`.
- `POST /api/kensa-boxes/:kensaId/void` body `{reason, leader:{username,name}}` -> `{ok, kensaId, status:'voided'}`. 409 once `kensaRecordId` is set or status is not complete/draft. Gives pieces back, reopens the draft it replaced.
- `GET /api/kensa-inputs/:id` (`...-B###` or `...-S###`) -> `{kind:'dcp'|'srs', id, 品番, 背番号, lotNumbers[], status, usable, base, consumed, remaining}`. 404 unknown; 400 for a `-K###` id (`kind:'kensa'`). SRS voided/superseded: 200 with `usable:false`, `remaining:0`, `status`. `base` = qtyMeasured else qtyLabel. Shared pool: DCP consumed = SRS use + Kensa use; SRS box consumed = Kensa use.
- `POST /submitToKensaDBInteractive`: legacy kensaDB fields (required: 品番 背番号 Total 工場 Worker_Name Process_Quantity Remaining_Quantity Date Time_start Time_end 設備 Counters Total_NG 製造ロット Cycle_Time) + `Kensa_Box_IDs[]`, `Box_IDs[]` (DCP + SRS ids), `Lot_Details`, `Submit_UID`, `Kensa_Unlabelled_NG:[{boxId|srsId, ngTotal}]`, `Kensa_Label_Bypass`. Photos: same payload as DCP interactive (`/submitToDCP`): `images:[{base64, label:'初物チェック'|'終物チェック', sebanggo, date, worker, factory, machine}]` (`photos` is accepted as an alias); base64 without a `data:` prefix. 初物 required (400 if missing, 502 if its upload fails, nothing saved); 終物 optional. Stored as `初物チェック画像` / `終物チェック画像` URLs, uploaded to `CycleCheck/<factory>/`. Returns 201 `{message, insertedId}`; a retry of the same `Submit_UID` returns 200 `{existing:true, insertedId}`. 409 if a `Kensa_Box_IDs` label is unknown, voided/superseded or already linked.
- Notes: (1) print process name is lowercase **`kensa`** (already in `ioT/print_DBprinter.py` PROCESSES and server `SCNA_LABEL_PROCESSES`); `KENSA` in K11/K12 is wrong and would fall back to the press layout. (2) For a DCP box, a Kensa pull is also mirrored into `srsConsumed` with `viaKensa:true` so the unchanged SRS routes see the pieces as taken. (3) New unique partial index `Submit_UID` + indexes on `Kensa_Box_IDs`/`Box_IDs` are created on `kensaDB` on first submit.

## 8. Change log
| Date | Phase | Change |
|---|---|---|
| 2026-10-27 | 0 | Plan written from Q&A rounds 1–2 |
| 2026-10-27 | 2-4 | `Kensa interactive SCNA.js` built (B) against the STATIC-DOM version of the HTML (ids as in the file on disk: scanInputs/inspBody/counter-plus-N/printModal/leaderModal; tab data-tab=production). Headless Chrome mocked-fetch test ~60 checks pass. Extra i18n key needed: `kensa_e_input_used` (ja 使用済みの箱は削除できません: {0} / en Cannot remove an input that is already used: {0} / pt Nao e possivel remover uma entrada ja usada: {0}). Uses print process `kensa` (lowercase) |
| 2026-10-27 | 1, 5 | Server built (Agent A): kensa boxes, inputs, void, `/submitToKensaDBInteractive`; tested on a real temporary mongod (contract in section 10). Print process is `kensa` (lowercase), no print_DBprinter.py change needed |
| 2026-10-27 | 2, 3, 5 | Page + i18n (ja/en/pt) + TV tiles IT1/IT2 built (Agent C); headless Chrome with mocked fetch passes scan -> counters -> 初物 -> print complete/draft -> submit (ja, en). Fixed JS `LABEL_PROCESS` KENSA -> kensa |

## 9. DOM contract (Agent C <-> Agent B) — `Kensa interactive.html` (final)
Shell ids same as SRS (`headerMachineTag clock languageSelector infoBtn prodBadge`, `step0*`, `step1Modal step1Content step1ErrorMsg step1Scanner qrReader startStep1Scan manualBoxId manualBoxOk step1MachineName doneToProd`, break / maintenance / call-leader / sidebar (`infoLanes`) / alert / confirm / worker modals, `toast`). Tabs `data-tab=scan|production|maintenance`, panels `panel-scan panel-production panel-maintenance`. No LH/RH.
Scan tab: `scanProduct scanProdName scanProdMeta scanInputs(.input-chip rows by JS) scanInputsEmpty`.
Inspect tab (static): `inspEmpty goScanBtn inspBody inspProdName inspProdMeta inspChips inspCurInfo inspStart inspEnd inspEndNow inspLot inspSpare inspComment counterGrid #counter-box-N #counter-N #counter-plus-N #counter-minus-N (N=1..12) counterInputName totProc totGood totNg totNgReal inspCycle hatsumonoButton hatsumonoFileInput hatsumonoPic hatsumonoLabel hatsumonoStatusIndicator lblList printCompleteBtn printDraftBtn resetBtn submitBtn`.
Dialogs (static): `printModal printTitle printInfo printAlloc printQtyWrap printQty printSum printError printCancel printOk`, `leaderModal ldTitle ldText ldReader ldStatus ldCancel`.
i18n: all `kensa_*` keys used by HTML/JS are in `Kensa interactive i18n.js` (ja/en/pt). Print/layout process is lowercase `kensa`.

### i18n keys B uses (B: append here; C adds every key to `Kensa interactive i18n.js` ja/en/pt)
Reuse existing i18n.js keys without a prefix: `daily_report yes close cancel maintenance_tab machine_trouble_title maintenance_* total_trouble_time call_btn_label stopcall_* product_info_title`.
All page/JS strings prefixed `kensa_` (C pre-provides a large set; list is in the i18n file). Missing keys: B please add below.
