# DCP interactive: per-machine checklists + NG for grouped machines

Status: built 2026-11-19 on feature/dcp-json-send-live-count (headless-tested with a mock API; not yet tested on a tablet / real server).

## Problem

A grouped tablet (`?machine=OZNC04,OZNC06`) runs ONE checklist for "OZNC04,OZNC06":

- `initChecklistsForMachine` (DCP interactive backend.js) sends the whole string to
  `/api/check-forms/templates`; a template linked to both machines comes back once.
- The record is submitted with `machine: "OZNC04,OZNC06"`; answers/tickets/photos are keyed by field id only.
- `/api/check-forms/today-status` expands the name with `getRelatedMachineIds` (machineGroupPairs + grouped
  setsubiDB entries), so one record unlocks both machines, and also unlocks `?machine=OZNC06` opened alone.
- NG tickets are filed under the pair, so nobody can tell which machine failed, and the ticket blocks both.
- `/api/check-forms/today-overview` matches by any name part: one pair record shows BOTH machines as done.

DB state (2026-11-19): 2 active templates. `NCカッター設備点検` (小瀬) is linked to OZNC04, OZNC06 and the grouped
`OZNC04,OZNC06` entry. SCNA `sample` is linked only to grouped `AOL 4,5`.

## Locked rules

1. **One checklist per machine.** The queue is machine × template. A template applies to a machine if it is
   linked to that machine OR to a grouped setsubi entry containing it (so a template linked only to a group gives one
   copy per machine). No "group checklist" flag.
2. Records, NG tickets, Chatwork notices and bypass records are saved with ONE machine name.
3. Answers, tickets, photos, recordIds and the local draft are kept per machine (the same template on two machines
   has the same field ids).
4. **Bypass is per machine.** The leader bypasses OZNC04 and OZNC06 separately (2 QR scans). Bypass still
   overrides an open NG ticket (same as today; the ticket stays open for maintenance).
5. **A blocked machine does not stop the other.** If OZNC04 has failed/unfinished checklist and OZNC06 is done
   (or bypassed), only OZNC06 can be operated: send to machine, lot scan, shots, defect counting, cycle stop / break.
   OZNC04 is shown greyed with 点検NG / 点検未完了. Tabs unlock when at least one machine is OK. When maintenance
   resolves OZNC04's NG it joins after its lot is scanned.
6. **NG counts per machine and per lot**, as in SCNA (`defectByMachineLot`), on top of the dynamic 不良管理 list
   (DCP interactive defects.js): one big red button per machine (name, NG on its current lot, lot number); tapping
   it opens the defect list for that machine's current lot. Keyed machine → lot → defect id. A blocked or lot-less
   machine's button is greyed and only shows the reason. Saved into `Lot_Details[].defects`; run totals (Defects, Total_NG) stay as now. Each
   machine gets its own NG in `/api/machine-assert` (TV).
7. **Daily report 設備 = only the machines that ran** (like SCNA's active machines).
8. today-status no longer adds the pair partner for checklists.
9. **Old data is kept as is.** Records saved as `"OZNC04,OZNC06"` are legacy group records: the overview shows them as
   one group record and they don't count as done for either machine.

## Defaults (not asked)

- The worker name is entered once and used for every machine's checklist.
- Post-production checklists are split per machine too.
- A single-machine tablet looks exactly as it does today (no machine switcher).

## UI

- Grouped tablet: the checklist tab opens on one card per machine (name, status, "x/y 項目" + progress bar).
  Tapping a card opens that machine's checklist, with a "← 機械一覧" back button in its colour banner.
- After a machine is submitted the page returns to the cards: done/bypassed = green (tap → today's record),
  NG = red (保全の確認待ち), next machine = 「次はこちら」, no checklist = grey 「点検なし」 (not tappable).
- The lock message names the machine: "OZNC04 の NG が解決されるまで OZNC04 は使えません".
- No "copy answers from the other machine".

## Where it touches

- Client: checklist module in `DCP interactive backend.js` (init, state, draft, render, submit, tickets, bypass,
  today-status sync), the tab lock in `DCP interactive.html` (`isChecklistLocked`, `updateTabLock`,
  `assertMachineState`), every `groupedMachines` use (send, lot chooser, shots, defect photo, SSE, stop-call),
  `DCP interactive defects.js` (per-machine rows), `DCP interactive SCNA.js` (`activeMachines` ∩ operable).
- Server (`server.js`): `/api/check-forms/templates` (per-machine resolve incl. grouped entries), `today-status`
  (per machine, no pair expansion, per-machine result), `bypass`, `today-overview` (legacy group records).

## Built (2026-11-19)

- Client state: `checklistMachineStates` (one state per machine), `window.checklistState` = machine on screen.
  Helpers: `getChecklistMachineStatus`, `isMachineChecklistOk`, `getOperableMachines`, `getChecklistBlockedMachines`,
  `switchChecklistMachine`, `advanceToNextChecklistMachine`. Draft save/load/clear take a state argument.
- Gating: lot chooser + defect-photo chooser grey blocked machines; grouped send, per-machine send buttons and
  `sendToIndividualMachine` skip them; `promptFinalLots` auto-lots only operable machines; SCNA NG rows grey them.
- Submit: `Lot_Details[].Defects` / `Total_NG` per lot; `設備` = machines that have a lot (non-SCNA).
- Server: `buildCheckFormExactMachineFilter` for today-status and the submit's existing-record lookup;
  today-overview matches exact names, shows pair-name records as `legacyGroup` rows outside the KPIs, and drops
  grouped setsubi rows that have no records that day.
- Known gap: SCNA template `sample` is linked to `AOL 4,5` but SCNA tablets use `AOL-4`/`AOL-5`, so names don't
  match (same as before). Not changed: fixing it would start locking AOL tablets with that checklist.
