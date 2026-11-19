# DCP interactive: per-machine checklists + NG for grouped machines

Status: plan locked 2026-11-19, not built yet.

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
6. **NG counts per machine and per lot**, as in SCNA (`defectByMachineLot`), on top of the dynamic 不良管理 tiles
   (DCP interactive defects.js): one tile row per machine, keyed machine → lot → defect id, the blocked or lot-less
   machine's row greyed. Saved into `Lot_Details[].defects`; run totals (Defects, Total_NG) stay as now. Each
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

- A machine switcher above the existing checklist selector: big tabs `OZNC04 ✓完了` / `OZNC06 3/12` /
  `⚠NG`, each machine with its own colour and a name banner on every card.
- Auto-advance: "OZNC04 完了 → OZNC06へ" after a machine's last checklist.
- The lock message names the machine: "OZNC04 の NG が解決されるまで OZNC04 は使えません".
- No "copy answers from the other machine".

## Where it touches

- Client: checklist module in `DCP interactive backend.js` (init, state, draft, render, submit, tickets, bypass,
  today-status sync), the tab lock in `DCP interactive.html` (`isChecklistLocked`, `updateTabLock`,
  `assertMachineState`), every `groupedMachines` use (send, lot chooser, shots, defect photo, SSE, stop-call),
  `DCP interactive defects.js` (per-machine rows), `DCP interactive SCNA.js` (`activeMachines` ∩ operable).
- Server (`server.js`): `/api/check-forms/templates` (per-machine resolve incl. grouped entries), `today-status`
  (per machine, no pair expansion, per-machine result), `bypass`, `today-overview` (legacy group records).
