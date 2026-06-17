# Lot-level ショット数 / meters / pieces tracking (DCP interactive)

Status: **agreed spec — implementation in progress**
Scope: `DCP interactive.html` + `DCP interactive backend.js` (client only — **no server change needed**)

## Goal

Track production **per material lot**, not just per shift, so we know for every
lot number:

- **ショット数 (shots)** = machine cycle count for that lot
- **使用メートル (meters)** = material length consumed by that lot
- **生産数 (pieces)** = pieces produced by that lot

This lets us answer "how many pieces / how many meters did each lot produce".

## The core mechanic

The physical machine's ショット数 counter **resets to 0 every time a new program
is sent** (Send to machine). Therefore the count sitting on the machine when the
operator scans the *next* lot is the production of the lot that just finished.

➡️ **Shots entered at a lot change are attributed to the PREVIOUS lot**, not the
newly scanned one.

- **First lot of a session:** no previous lot, so no shot prompt — just photo + send.
- **Final / current lot:** never has a "next scan", so it is captured by a
  **popup triggered when the operator enters Time End (End Time)**.
- The old session-level ショット数 input on the production/params tab is **removed**;
  the per-scan prompt + the Time-End popup now cover every lot.

## Flow — single machine

1. Scan new lot → 2. take material-label photo → 3. **if a previous lot is open**,
   prompt for ショット数 (numeric keypad) → attaches to the previous lot and
   auto-computes meters & pieces → 4. **Send to machine** (machine resets to 0).
5. On **Time End** entry → popup asks for the final (open) lot's ショット数.

## Flow — grouped machine (machine value contains a comma, e.g. `OZNC04,OZNC05`)

Each machine has its **own independent lot timeline**.

1. Tap scan → **choose which machine** (one button per machine in the group —
   **no "Both" option**).
2. Scan lot → photo → if that machine has an open lot, prompt its ショット数 →
   **Send to that machine only** (resets only that machine).
3. On **Time End** → popup lists each machine that still has an open lot and asks
   for each one's ショット数.

The same lot number may appear under two different machines (de-dup is per machine).

## 送りピッチ / pcPerCycle resolver

For a given machine, resolve from the cached masterDB product record, in order:

1. **`machineConfig[machine]`** → `{ 送りピッチ, pcPerCycle }` (preferred, clean)
   ```json
   "machineConfig": { "OZNC04": { "送りピッチ": 820, "pcPerCycle": 4 },
                      "OZNC05": { "送りピッチ": 1590, "pcPerCycle": 8 } }
   ```
2. **Encoded string** `"OZNC(04,06,08,10):820 OZNC(03,05,07,09):1590"` → parse to
   map machine → pitch. (pcPerCycle from top-level `pcPerCycle` if present.)
3. **Plain value** `"送りピッチ": "425"` → single pitch for the machine; top-level
   `pcPerCycle` (may be `""`).

## Formulas

- `meters = shots × feedPitch ÷ 1000`  (送りピッチ is in **millimeters**)
- `pieces = shots × pcPerCycle`

When `pcPerCycle` is missing/empty (e.g. the C74 record): set `pcPerCycle: null`,
**omit `pieces`** for that lot, and `Total_Pieces` sums only lots that have a
piece count.

## Runtime data model

```js
// machine -> ordered array of lot records (persisted to localStorage)
lotsByMachine = {
  "OZNC04": [
    { lotNumber, machine, shots, feedPitch, pcPerCycle, meters, pieces, source, open }
  ]
}
```
- Single machine = one key.
- "Previous/open lot for machine X" = X's last record with `open: true`.
- Scanning a new lot for X **closes** X's open record (with the entered shots) and
  **opens** the new one.
- Time End closes whatever remains open.

The existing `materialLots` array, `材料ロット` comma string, lot tags, and
material-label photo linking are preserved.

## Submit payload — NEW fields (pressDB only, additive)

```jsonc
"ショット数": 275,                 // EXISTING field — now auto-summed total of all lots
"Lot_Details": [
  { "lotNumber": "260625-1", "machine": "OZNC02", "shots": 120,
    "feedPitch": 820, "pcPerCycle": 4, "meters": 98.4, "pieces": 480 },
  { "lotNumber": "260625-2", "machine": "OZNC02", "shots": 95,
    "feedPitch": 820, "pcPerCycle": 4, "meters": 77.9, "pieces": 380 },
  { "lotNumber": "260625-3", "machine": "OZNC02", "shots": 60,
    "feedPitch": 820, "pcPerCycle": 4, "meters": 49.2, "pieces": 240 }
],
"Total_Meters": 225.5,
"Total_Pieces": 1100
```

- **No existing field is removed or renamed.** Only `Lot_Details`, `Total_Meters`,
  `Total_Pieces` are added; `ショット数` is now auto-calculated as the grand total.
- `材料ロット` (comma string) unchanged.

### Why no server change is needed
`/submitToDCP` builds pressDB as `{ ...formData, ... }` (spreads everything, then
deletes only a known kensa-only list), while kensaDB is built explicitly field by
field. So new client fields automatically land in **pressDB** and never reach
**kensaDB**. (server.js ~line 3042 pressDB / ~3110 kensaDB.)

## UI to retire
- The production/params ショット数 input (`#shot`) and the per-machine grouped
  inputs (`#shotCountSection`, `createGroupedShotInputs`, `updateTotalShot`).

## Edge cases
- First lot → no shot prompt. Single-lot session → entirely captured by Time-End popup.
- Re-scan after a Time-End popup → re-opens that machine's lot.
- `pcPerCycle` missing → `pieces` omitted, meters still recorded.
- Same lot number on two different machines → allowed (per-machine de-dup).
