# SCNA on DCP Interactive: Agreed Plan

Status: PLAN ONLY, nothing built yet. Agreed in conversation, 2026-10-20.

## Goal

Move factory **SCNA** from the outdated `SCNA DCP.html` / `SCNA DCP backend.js` to the
`DCP interactive` UI, which 小瀬 uses in production.

**Hard rule: 小瀬 (and every other factory) must not change in any way.**
All SCNA behavior is gated on `?filter=SCNA`. Nothing may break production.

## Approach (decision)

Do NOT fork a standalone page, and do NOT scatter `if (SCNA)` through the shared code.

- Put all SCNA logic in a **separate file**, `DCP interactive SCNA.js`, loaded only when `filter=SCNA`.
- SCNA-only HTML elements live in hidden containers, shown only by the SCNA file.
- Shared files (`DCP interactive.html`, `DCP interactive backend.js`) get only tiny, guarded
  hooks such as `window.SCNA?.xxx?.()`. These are no-ops for other factories.
- Work on a new branch off `freyaAdmin-dynamicDash-b`. Nothing goes to main until verified at SCNA.
- Keep `SCNA DCP.html` live and unchanged as the fallback until SCNA is verified on the floor.
- `chooseMachine.html` routing (SCNA to the new page) is changed LAST.

Starting state: `freyaAdmin-dynamicDash-b` already contains all of `origin/main` (0 behind, 18 ahead).
`DCP interactive*` files are identical to main.

## Machines and tablets

Machines: AOL-1 to AOL-5 (the old code pre-caches IPs for AOL-1 to AOL-8).

| Tablet link | Meaning |
|---|---|
| `...SCNA%20DCP.html?filter=SCNA&machine=AOL-1` | solo tablet |
| `...?filter=SCNA&machine=AOL+2%2C3` | paired tablet, AOL-2 and AOL-3 |
| `...?filter=SCNA&machine=AOL+4%2C5` | paired tablet, AOL-4 and AOL-5 |

Support all combinations (3 or 5 tablets). `+` / `%2C` decode to `AOL 2,3`.

- Normalize to a list `["AOL-2","AOL-3"]` for everything internal (lot tracking, stop-call, shot sums, checklists, IP lookup).
  The interactive page's existing `groupedMachines` splits on `,` and would wrongly give `["AOL 2","3"]` for SCNA. Must be fixed for SCNA only.
- The legacy `設備` string stays exactly as before, for example `"AOL 2,3"`.

### Tablet "home" (the URL is the source of truth)

- The machine in the opened URL is the tablet's **home**. It is saved to localStorage (`scna_home_machines`) and overwritten on every normal load.
  To repoint a tablet: open or re-bookmark the link with the new `machine=`. There is no separate reset screen.
- Loads with `&override=1` (see below) must NOT overwrite the stored home.
- Every submission includes a new field `Tablet_Home`.
- **After a successful submission, AND after the Reset button, the tablet returns to its home link** (`?filter=SCNA&machine=<home>`),
  with override/draft state for the WO's machines cleared.
  (Both code paths: `clearFormDataAndReload()` and the reset button/`resetForm()`.)
- Drafts are localStorage keys per machine (`uniquePrefix = page_factory_machine_`). Old machines' unsent drafts stay under their own keys and never mix in.

## Work orders (collection `SCNAWorkOrderDB`)

Doc fields used: `Number` (WO-xxxxxx), `Status`, `P_SKU-Custom fields` (e.g. `P775031-P0863-WIP`),
`Customer-Custom fields`, `Assign to-Custom fields` (`"AOL 4,5"` or `"AOL 1"`), `Deadline`.

- Endpoint exists: `GET /getSCNAWorkOrders` (server.js ~5212). No server change expected.
- WO appears in the 背番号 dropdown (`WO-...`). Selection: strip the leading `P` from the SKU, look up masterDB by 品番, auto-switch to the 背番号,
  show a WO info box (WO, assigned to, status, SKU, 背番号). Comments stay editable.
- Max 2 machines per WO (for now). Parse `"AOL 4,5"` to `["AOL-4","AOL-5"]`.
- A normal 背番号/品番 with no WO is still allowed. It uses the URL machine as-is.

### Wrong-tablet logic

- WO machines equal to, or a subset of, the tablet's home: no warning. For a subset, only those machines are active
  (for example a WO for AOL 3 on the AOL 2,3 tablet uses just AOL-3).
- WO machines NOT within home: a warning "This work order is for AOL 4,5, not this tablet (AOL 2,3)".
  - It can be dismissed at any time with no leader needed. Dismissing clears the WO selection and leaves the page unchanged.
  - The warning has a small **Override** button, which opens a **leader QR scanner**. A valid leader scan (existing `/verifyLeader`) allows it.
  - After the override the page switches to the WO's machines (URL gets `&override=1`), re-keys the drafts, and runs the checklists for those machines.
  - `Tablet_Home` still records the original tablet.
  - After submit or reset, return to home.

## Checklists (check forms)

- Reuse the existing `/api/check-forms/templates?factory=SCNA&machine=...` flow.
- Run on page load for each home machine: a paired tablet does two checklists (AOL-2 then AOL-3), a solo tablet does one.
  The interactive page currently calls `initChecklistsForMachine` with one whole machine string. For SCNA, run it as a sequential per-machine queue.
- Admins create SCNA templates in the admin page. Template machine names must use the hyphen form, `AOL-3`.
- No templates for a machine: the checklist tab hides and the page is not locked (verified in code). So SCNA works before forms exist.

## Features to bring over from the old SCNA page

1. **Send to Machine** (`#sendtoNC`): for each target machine, open `http://<ip>:5000/request?filename=<背番号>.pce` (IP via the existing `ipURL?filter=<machine>` lookup, pre-cached).
   Per-machine manual resend buttons. Red/green button state, 10-second reminder modal if not sent. Records `ncProgramSent` and `ncSendTimestamp`.
2. **2-hour quality check:** working time only (minus breaks and maintenance), a modal at **120 min**, **Snooze 15 min** (keep both),
   inspector name recorded, stops when the work is completed. Submitted as `2HourQualityCheck`.
3. **Setup reminder** if a start time is missing 1 minute after a product is chosen.
4. **Partial from Spare** (`#partial-from-spare`), submitted as `スペアからの部分数`.
5. Break-time locking with Edit buttons, processing-time locking, the check that break plus maintenance cannot exceed processing time.
6. Material lot **keypad entry** (SCNA labels' QR is unreadable) and material-label photos.
7. Separate inspector dropdown or manual entry; `printLabel`; numeric keypad.

## New in SCNA (from the interactive page)

- **Stop-call / call-leader**, keyed by the normalized machine name. TBD: whether `factory-stopcall-tv.html` has an SCNA view.
- **Per-lot tracking with shots** (photo plus shot count on each new lot scan), the same flow as 小瀬.
  - With 2 machines assigned, the lot step asks which machine (AOL-4 or AOL-5). `Lot_Details[].machine` = `"AOL-4"`.
  - `shot1` / `shot2` = sums of shots per machine (legacy fields kept).
  - No material-QR validation for SCNA (no `材料背番号`). Lot numbers are entered by keypad. `materialSeiban` is omitted.
- **Params guide / video manuals:** shown for SCNA.
- **Process Quantity stays manual** for SCNA (disable the interactive auto-calculation from `pcPerCycle`).

## masterDB (SCNA records)

- `pcPerCycle`: now filled for all SCNA records (required for `Lot_Details.pieces`).
- No `machineConfig` needed (AOL-2 to 5 have the same length).
- `送りピッチ`: either an integer or a string like `"730 (7)"`. **Display and rolldist show the raw value including `(7)`; all length math uses the parsed number (730).**
  The meaning of `(7)` is unknown. Ask SCNA. `parseFloat` already yields 730, but add an explicit `parsePitch()` in the SCNA module.
- `材料背番号` is blank on purpose.

## Submission (`POST /submitToDCP`)

- Keep EVERY legacy field exactly as in the current SCNA pressDB docs (legacy readers must keep working):
  `品番, 背番号, 設備 ("AOL 4,5"), Total, 工場, Worker_Name, Process_Quantity, Date, Time_start, Time_end, 材料ロット (comma-joined string),
  疵引不良, 加工不良, その他, Total_NG, Spare, Comment, Cycle_Time, ショット数, スペアからの部分数, Break_Time_Data, shot1, shot2,
  Total_Break_*, Maintenance_Data, Total_Trouble_*, Total_Work_Hours, 2HourQualityCheck, WorkOrder_Info, materialLabelImages,
  materialLabelImageCount, 初物チェック画像, 終物チェック画像, 材料ラベル画像, createdAt`
- ADD alongside: `Lot_Details`, `Total_Meters`, `Total_Pieces`, `StopCall`, `Tablet_Home`.
- Gotcha: the SCNA page sends `Inspector_Name`, while the interactive page sends `Inspection_Name`. The server reads **`Inspector_Name`**
  (server.js ~4669) for the kensaDB worker name. SCNA must keep sending `Inspector_Name`.
- The server spreads `formData` into pressDB, so the extra fields pass through. Re-verify with a test submit (do NOT write to production data).

## Build order

1. SCNA module skeleton and loader, machine normalization (`AOL 2,3` to a list), tablet home, return-to-home on submit and reset.
2. Work-order dropdown, selection, info box, wrong-tablet warning, leader override.
3. Lot tracker machine picker (`shot1`/`shot2`), the pitch parser.
4. Send to Machine, 2-hour check and snooze, setup reminder, partial from spare, break-time locks.
5. Checklist queue per machine, stop-call.
6. Submit payload (legacy plus new fields); a test submit to verify.
7. `chooseMachine.html` routing, last.

## Open items

- Meaning of `(7)` in `送りピッチ`.
- Does an SCNA stop-call TV view exist (`factory-stopcall-tv.html`)?
- Confirm that SCNA check-form template names use `AOL-n`.
- Test on a copy of the page before any real tablet uses it.
