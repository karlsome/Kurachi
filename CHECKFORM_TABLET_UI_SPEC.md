# Check Form Tablet UI Spec

Last updated: 2026-05-20

## Purpose

This document captures the agreed rules for the new tablet checklist UI driven by `Sasaki_Coating_MasterDB.checkFormTemplatesDB`.

This phase is intended to be complete for UI interaction and submission behavior, but it does **not** add due-date or schedule gating logic yet. That condition logic will be added later in an existing JavaScript file.

## Core Goals

- Build a tablet-first checklist UI optimized for portrait mode on 10-inch tablets or smaller.
- Keep the UI fully usable in landscape mode as well.
- Use a simple, low-color visual style.
- Render checklist inputs dynamically from `fields` in template order.
- Support field-level validation, local draft photo storage, ticket creation, and final submission.
- Use `server.js` as the backend implementation surface.

## Entry Context

- The page receives the factory and machine from the URL query string.
- Query parameter format:
  - `?selected=第二工場&machine=OZNC02`
- The selected factory controls:
  - which templates are shown
  - which worker names are selectable
  - Firebase upload folder base
- The selected machine is the `加工設備` value and controls:
  - which templates are shown for the current checklist session
  - which machine the final checklist submission is associated with

## Source of Truth

### Templates

- Database: `Sasaki_Coating_MasterDB`
- Collection: `checkFormTemplatesDB`
- Each template includes:
  - `name`
  - `description`
  - `工場`
  - `equipmentIds`
  - `schedule`
  - `startDate`
  - `fields`
  - `status`

### Equipment Resolution

- Database: `Sasaki_Coating_MasterDB`
- Collection: `setsubiDB`
- Purpose: resolve template `equipmentIds` into equipment display data
- Equipment document shape:
  - `_id`
  - `name`
  - `工場`
  - `imageURL`

### Worker Names

- Database: `Sasaki_Coating_MasterDB`
- Collection: `workerDB`
- Purpose: populate the locked `name` field
- Worker document shape includes:
  - `Name`
  - `ID number`
  - `部署`
  - `Picture`
- Worker filtering rule:
  - only show workers whose `部署` contains the selected factory
  - example: if the checklist factory is `小瀬`, do not show workers that do not belong to `小瀬`
  - if `部署` contains comma-separated factories, split by comma and trim whitespace before matching

## Schedule Handling

- Template `schedule` can be `daily`, `weekly`, or `monthly`
- The schedule type must be visually obvious before the field cards begin
- This phase does **not** include due-date logic, completion-window logic, or duplicate-submission blocking
- This phase is UI-first; schedule conditions will be added later

## Template Loading Behavior

- Load active templates for the selected factory and selected machine
- Respect the `fields` array order exactly as stored in the template
- A template is shown only if its resolved equipment list includes the selected machine name from `&machine=`
- Current implementation assumption for equipment scope:
  - one checklist submission inherits the template's full `equipmentIds` array
  - resolved `equipmentNames` should also be stored in the submitted data
  - the selected machine from the URL is also stored separately on submission as the active machine context
  - there is no separate equipment picker in this phase
- This assumption can be changed later if per-equipment submissions are introduced

## UI Layout Rules

- Portrait-first layout for tablets
- Landscape layout must remain usable without hiding core actions
- Minimal color palette
- Clear spacing and large touch targets
- Show the checklist type clearly near the top:
  - `Daily Check`
  - `Weekly Check`
  - `Monthly Check`
- Each field must render inside its own rectangle/card
- Each card should contain, when applicable:
  - field title
  - field description
  - template thumbnail from `imageURL`
  - answer control
  - camera button if `photoRequired` is true
  - ticket button
  - captured image thumbnail area
  - answered/validation state
- The answered state must be very easy to recognize
- The submit and reset actions are shown at the bottom

## Field Rendering Rules

### `name`

- Render as a locked name field
- The value comes from `workerDB`, filtered by factory membership
- Once chosen, it should behave as a locked field unless reset

### `checkbox`

- Render two buttons:
  - `OK`
  - `NG`
- If `NG` is selected:
  - a ticket becomes required
  - the ticket modal opens automatically
- The card is not complete until the required ticket details are saved locally in the draft state

### `number`

- Tapping the number field opens a dedicated numeric keypad
- The keypad must support:
  - digits
  - minus sign `-`
  - decimal input
  - backspace
  - clear
  - confirm
- If a `unit` exists, show it as a suffix in the displayed value
- Example: `24C`
- Validation rule:
  - if `min` and/or `max` exist, compare the entered numeric value against those bounds
  - if out of range, a ticket becomes required and the ticket modal opens automatically

### `text`

- Render as a normal text input or textarea
- No automatic ticket is required from text value alone
- The manual ticket button is still available on the card

### `select`

- Render as a single-choice selection control
- Only one option can be selected in this phase
- Validation rule:
  - if `min` and/or `max` exist and the selected option is numeric, compare it to the bounds
  - if out of range, a ticket becomes required and the ticket modal opens automatically

## Card Completion Rules

A card is considered answered only when all required conditions for that field are satisfied.

### Base Answer Requirement

- `name`: a valid worker is selected
- `checkbox`: either `OK` or `NG` is selected
- `number`: a value is confirmed through the keypad
- `text`: text has been entered when the field is required
- `select`: one option is selected

### Additional Required Conditions

- If `photoRequired` is true, the field must have a captured local photo before the card is complete
- If the answer triggers a ticket requirement, the ticket reason must be saved locally before the card is complete

## Visual Status Rules

- Answered cards must have a strong visual completion cue
- Unanswered or invalid cards must be clearly identifiable
- On submit, any missing required answer should be highlighted in red
- If multiple cards are incomplete, scroll to the top-most incomplete card

## Submit Button Behavior

- Do **not** disable the submit button
- When submit is pressed:
  - validate all cards in order
  - find the first incomplete card
  - scroll that card into view
  - highlight it in red
  - stop submission until the issue is resolved

## Field Photo Capture Rules

- If `photoRequired` is true, show a camera button inside the card
- Use native image capture where possible
- Do not upload field photos immediately after capture
- Store field photos locally until final submit
- Local draft photo storage should use `IndexedDB`
- Do not use `localStorage` for MB-scale images
- In this phase, each field supports one captured photo unless expanded later
- After capture:
  - show a thumbnail in the card
  - allow preview in a larger view
  - allow delete/retake before final submission

## Ticket Rules

- Every card includes a ticket button
- A ticket becomes required when:
  - a checkbox answer is `NG`
  - a numeric value is outside `min` or `max`
  - a select value is numeric and outside `min` or `max`
- When a ticket becomes required:
  - open the ticket modal automatically
  - if the modal is closed without saving, the card remains incomplete
  - the ticket button should keep a noticeable animation, such as shake or pulse, until the ticket is saved locally
- The ticket button can be pressed again at any time to reopen the modal

## Ticket Modal Rules

- Ticket modal collects the reason for the abnormal answer
- Ticket modal also supports image capture
- Ticket modal image rules:
  - up to 5 images
  - native image capture/input
  - show thumbnails immediately after capture
  - tapping a thumbnail opens a large preview
  - each thumbnail has a delete affordance at the top-right, such as a minus button
- Ticket data is **not** saved to the database immediately
- Ticket data is saved only if the whole checklist submission succeeds

## Template Thumbnail vs Submitted Images

- `fields[].imageURL` in the template is reference media only
- It should be displayed as a static thumbnail when present
- It should **not** be overwritten during form submission
- Captured field photos and ticket photos must be uploaded to Firebase on submit
- The resulting Firebase URLs must be stored in the submitted data for future viewing

## Firebase Storage Rules

- Base upload folder: `maintenanceForm/<factory>`
- Implementation may use subfolders under that base for organization
- Recommended structure:
  - `maintenanceForm/<factory>/fields/...`
  - `maintenanceForm/<factory>/tickets/...`
- Upload happens only during final submit
- Uploaded Firebase URLs are written into the saved records

## Submission Flow

Submission should be treated as one complete workflow handled by `server.js`.

### Client-Side Draft Stage

- Keep answers in draft state
- Keep field photos in `IndexedDB`
- Keep ticket reason and ticket images in draft state
- Do not write tickets to MongoDB early

### Final Submit Stage

Recommended sequence:

1. Validate all cards in order
2. If the first incomplete card exists, scroll to it and stop
3. Send the full checklist payload, including local image data references, to the backend
4. Backend uploads field photos and ticket photos to Firebase
5. Backend replaces local image data with Firebase URLs
6. Backend inserts the checklist record into `submittedDB.checkFormRecordsDB`
7. Backend inserts any related ticket records into `submittedDB.ngReportsDB`
8. Backend returns success only after both record and tickets are saved

### Submission Persistence Rules

- Ticket records must only be created when the full checklist submission succeeds
- If the overall submit fails, tickets must not be inserted on their own
- Submitted records must store Firebase URLs, not temporary local image blobs

## Submitted Checklist Record Shape

The exact schema can evolve, but the submitted record should preserve at least the following information:

```json
{
  "templateId": "6a0d39a371b0fa6df68c489e",
  "templateName": "test1",
  "schedule": "weekly",
  "factory": "小瀬",
  "machine": "OZNC02",
  "machineId": "69fd4259534321eae70ab460",
  "equipmentIds": [
    "69fd4259534321eae70ab461",
    "69fd4259534321eae70ab462"
  ],
  "equipmentNames": [
    "OZNC02",
    "OZNC03"
  ],
  "workerName": "青山",
  "submittedAt": "2026-05-20T12:34:56.000Z",
  "answers": [
    {
      "fieldId": "field-名前",
      "label": "名前",
      "type": "name",
      "value": "青山",
      "required": true,
      "status": "ok"
    },
    {
      "fieldId": "ebd81918-badd-488a-b102-cfda35bada04",
      "label": "power",
      "type": "checkbox",
      "value": "NG",
      "required": false,
      "photoRequired": false,
      "status": "ng",
      "ticketRequired": true,
      "ticketKey": "ticket_ebd81918-badd-488a-b102-cfda35bada04"
    },
    {
      "fieldId": "93c5933d-5f5d-4b75-b660-775dcb436e40",
      "label": "number t",
      "type": "number",
      "value": 12,
      "displayValue": "12",
      "min": 1,
      "max": 10,
      "unit": "",
      "status": "out-of-range",
      "fieldPhotoURL": "https://firebasestorage.googleapis.com/..."
    }
  ],
  "tickets": [
    {
      "ticketKey": "ticket_93c5933d-5f5d-4b75-b660-775dcb436e40",
      "fieldId": "93c5933d-5f5d-4b75-b660-775dcb436e40",
      "fieldLabel": "number t",
      "reason": "Measured value exceeded the upper limit.",
      "imageURLs": [
        "https://firebasestorage.googleapis.com/..."
      ]
    }
  ],
  "createdAt": "2026-05-20T12:34:56.000Z"
}
```

## Ticket Record Shape in `submittedDB.ngReportsDB`

Ticket records should preserve the abnormal event independently of the checklist record.

```json
{
  "source": "checkForm",
  "factory": "小瀬",
  "machine": "OZNC02",
  "machineId": "69fd4259534321eae70ab460",
  "templateId": "6a0d39a371b0fa6df68c489e",
  "templateName": "test1",
  "checkFormRecordId": "<inserted record id>",
  "equipmentIds": [
    "69fd4259534321eae70ab461",
    "69fd4259534321eae70ab462"
  ],
  "equipmentNames": [
    "OZNC02",
    "OZNC03"
  ],
  "workerName": "青山",
  "fieldId": "93c5933d-5f5d-4b75-b660-775dcb436e40",
  "fieldLabel": "number t",
  "fieldType": "number",
  "answerValue": 12,
  "min": 1,
  "max": 10,
  "reason": "Measured value exceeded the upper limit.",
  "imageURLs": [
    "https://firebasestorage.googleapis.com/..."
  ],
  "status": "open",
  "createdAt": "2026-05-20T12:34:56.000Z"
}
```

## Reuse Notes for Future Implementation

- `DCP backend.js` already contains useful patterns for:
  - native image capture
  - multi-photo handling
  - thumbnail rendering
  - preview modal behavior
  - deleting captured photos before upload
- Those patterns are especially relevant for the ticket modal image workflow

## Explicit Non-Goals for This Phase

- No due-date enforcement yet
- No daily/weekly/monthly completion-window logic yet
- No duplicate-submission prevention yet
- No automatic locking by calendar period yet

## Agreed Defaults Summary

- Factory comes from `?selected=<工場>`
- Machine comes from `&machine=<設備>`
- Templates come from `checkFormTemplatesDB`
- Templates are filtered to the selected factory and selected machine
- Equipment names come from `setsubiDB`
- Worker names come from `workerDB`, filtered by factory membership
- Checklist cards follow `fields` order exactly
- Submit button stays enabled
- First incomplete card is auto-scrolled and highlighted red on submit
- Out-of-range and `NG` answers require tickets
- Ticket modal supports up to 5 images
- Field photos are stored locally first and uploaded only on submit
- Local draft photo storage uses `IndexedDB`
- Submitted records and ticket records store Firebase URLs
- Template image URLs remain unchanged and are treated as reference thumbnails only