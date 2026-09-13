# thatmanipalkid

`thatmanipalkid` is a lightweight, link-based restaurant bill splitter. A creator uploads or enters a bill, shares one session link, and each participant selects the items they had. The creator confirms the participant list, then everyone sees the same calculated split.

The app does not require Google login and does not process payments. It uses Firebase Anonymous Authentication only to give each browser a backend identity that Firestore rules can verify.

## Features

### Explicit navigation

- Host setup has a top-left back control to return to the landing page. If items have been added, it asks before discarding the setup.
- The join screen returns a host to host setup only while the session is still a draft. Guests return to the landing page.
- Voting back navigation requires inline confirmation and removes the current participant and claims before returning to the landing page.
- Settlement can return to voting only while the session is open. Once calculation has started, the back control is disabled and the screen explains that the session is already settled.
- Navigation uses explicit routes rather than browser history, so redirects cannot send users through stale intermediate states.

### Anonymous sessions

- No Google account or traditional sign-up is required.
- The creator enters their name and a restaurant/session name on the landing page.
- Participants enter a display name through the shared session link.
- The product name, `thatmanipalkid`, is visible on the landing page.
- Creator and participant names are stored in Firestore in the session's `people` collection.
- Firebase Anonymous Auth supplies the backend UID used to protect session ownership.

### Bill entry

- The creator can upload a bill image.
- The server sends the image to Gemini for extraction.
- Extracted line items, prices, quantities, tax, service charge, discount, and total are written to Firestore together.
- The creator can also add, edit, and delete items manually.
- Quantity is optional. If omitted, the item remains valid and is treated as one item for splitting.
- Deleting an item also deletes every claim attached to that item.
- Parsing errors are shown in the setup page instead of silently failing.

### Live item selection

- Participants see the current number of people in the session.
- Each item has an inline circular check control in the same row as its name and price.
- The entire item card is tappable, including the name, price, and claimant avatars.
- Selected cards use an accent border and light tint for fast scanning at a table.
- Selecting an item adds the participant to that item's split.
- Selecting again removes the participant.
- The item list updates live through Firestore listeners.
- Running personal totals are intentionally hidden during selection because the participant list may still change.
- A live `You've selected:` summary below the item list shows only this participant's selected item names and current share amounts.
- Voting presence is refreshed every five seconds while the page is open.
- A confirmed tab close or navigation removes a guest and their claims; backgrounded mobile tabs receive a ten-second grace period first.
- The host periodically removes guests whose heartbeat has been stale for more than the grace period, covering abrupt browser termination where the departing tab cannot finish an async delete.
- Claims use one deterministic document per participant/item and direct Firestore writes, so rapid taps cannot create duplicate claims; the collection listener remains the source of truth for every connected screen.
- The page shows how many joined people have finished voting.
- Each participant can click `I am done voting` to lock their selections.
- A participant can click `Edit my votes` to unlock their selections and change them.
- The host cannot proceed to calculation until every joined person, including the creator, is marked done.

### Host confirmation and calculation

Sessions use these states:

| State | Meaning |
| --- | --- |
| `draft` | The creator is entering or editing the bill. Participants cannot join yet. |
| `open` | Participants may join and select items. |
| `calculating` | The creator confirmed the participant list. All users are sent to the calculation view. New users cannot join. |
| `settled` | Reserved for a future finalization step. Results remain visible. |
| `expired` | A draft or open session passed its expiry time. |
| `cancelled` | The creator cancelled the session. |

On the calculation page the creator can:

- See the names of everyone who joined.
- Remove a participant. Their claims are deleted at the same time.
- Assign an unallocated item to a specific participant.
- Split all unallocated items equally among existing claimants.
- Return to editing and recalculate. Reopening clears old claims so the next calculation starts cleanly.
- Delete the entire session from the setup page.

Every participant, including the creator, can also choose **Opt out of this session**. The action requires an inline confirmation, removes that person's participant record and claims, and redirects them to a simple confirmation page. If the session is already settled, items that become unclaimed because of the opt-out are equally redistributed among the remaining claimants before the next live settlement calculation. This does not cancel the session for anyone else.

The participant count on the voting page is a link for the creator to review the participant list before confirmation. Other participants cannot access host controls.

### Settlement math

The calculation follows a simple per-item model:

1. For every item, count its unique claimants as `n`.
2. Give every claimant exactly `item price / n` for that item.
3. Sum those item shares for each person.
4. Calculate each person's proportion from their item subtotal divided by the sum of all item subtotals.
5. Apply tax, service charge, and discount using that proportion.
6. Calculate `item subtotal + tax share + service share - discount share`.
7. Clamp invalid or negative intermediate values so a displayed final amount can never be negative.
8. Round each final amount to the nearest whole rupee.
9. Apply the bill-total leftover as one adjustment to only the person with the largest amount, provided that adjustment does not make them negative.

The calculation distributes:

- Item subtotals according to each item's claim fractions.
- Tax proportionally to claimed item subtotals.
- Service charge proportionally to claimed item subtotals.
- Discount proportionally to claimed item subtotals.
- Rounding adjustments to keep the displayed final amounts aligned with the entered bill total.

The code logs a warning when the leftover exceeds five rupees. That indicates a bill/claim mismatch rather than normal rounding.

The settlement screen shows the current participant's personalized `You pay` amount first. It then lists every claimed item, its split count and share, tax, service charge, discount, and any rounding adjustment needed for the displayed lines to reconcile. A separate list shows what everyone else owes. It also displays the computed total for the bill.

The results include an `Items split by` section showing each item followed by the names of all participants who claimed it. The host additionally sees `Total from everyone`, which is the sum of all displayed participant amounts and should match the computed bill total.

The worked verification scenario produces:

```text
Person A: ₹299
Person B: ₹299
Person C: ₹379
Person D: ₹81
Total: ₹1058
```

All four amounts are positive and the total matches the bill total exactly.

No payment request, UPI deep link, payment gateway, or payment confirmation is part of the app.

## Local development

Requirements:

- Node.js 18 or newer
- A Firebase project with Firestore
- Firebase Anonymous Authentication enabled
- A Gemini API key for bill image parsing

Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` unless that port is already in use.

Build verification:

```bash
npm run build
```

## Environment variables

Create `.env.local` in the project root. Never commit this file.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
GEMINI_API_KEY=...
```

`GEMINI_API_KEY` is server-only. Do not rename it with a `NEXT_PUBLIC_` prefix.

## Firebase setup

1. Create or select a Firebase project.
2. Create a Firestore database.
3. Enable **Authentication > Sign-in method > Anonymous**.
4. Register a web app and copy its configuration into `.env.local`.
5. Deploy the rules in `firestore.rules`.

With the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules
```

The app calls `signInAnonymously` automatically before it subscribes to session data. No Google provider is needed.

## Vercel deployment

The Vercel CLI does not need to be installed globally:

```bash
npx vercel@latest login
npx vercel@latest --prod
```

Choose Next.js and the project root when prompted. In Vercel project settings, add all Firebase variables and `GEMINI_API_KEY` for the Production environment. Redeploy after adding or changing variables.

The bill parser is deployed automatically as the Next.js route `/api/parse-bill`.

## Data model

```text
sessions/{sessionId}
  restaurantName
  createdAt
  expiresAt
  status
  hostUid
  taxAmount
  serviceChargeAmount
  discountAmount
  billTotal

sessions/{sessionId}/people/{personId}
  name
  joinedAt
  isHost
  authUid
  isDoneVoting
  lastSeen

sessions/{sessionId}/items/{itemId}
  name
  price
  quantity             optional

sessions/{sessionId}/claims/{claimId}
  itemId
  personId
  shareFraction
```

The browser keeps the session-specific person ID in tab-scoped session storage so a refresh in the same tab preserves the participant while a different tab starts fresh. The join form never reads a prior participant name. The `Not you? Join as someone else` action clears the current tab's identity and reveals a blank form. Legacy local-storage entries are ignored and removed. Firestore remains the source of truth for the session, participant, item, claim, and host UID records.

## Security model

Firebase Anonymous Auth is deliberately used instead of Google login. The Firestore rules then enforce:

- Only an authenticated UID can read session data.
- Only the UID in `sessions/{sessionId}.hostUid` can edit or delete the session and its items.
- Participants can create a person record using their own authenticated UID while the session is open.
- Participants can modify only their own claims.
- The host can remove people and clean up their claims.

This is stronger than trusting an `isHost` flag in local storage. It still is not the same as a permanent account system: clearing browser storage or changing devices creates a new anonymous identity.

## Expiry behavior

New sessions receive a two-hour `expiresAt` timestamp. The shared session hook derives `expired` for draft and open sessions once the timestamp has passed. Expired sessions are read-only from the UI and cannot be joined.

Expiry is currently lazy: there is no scheduled backend job deleting expired documents. This avoids deleting data unexpectedly and keeps the setup simple. A scheduled Cloud Function can be added later if automatic cleanup is required.

## Important migration note

Sessions created before `hostUid`, `expiresAt`, and `authUid` were added do not have the new identity fields. After deploying the stricter Firestore rules, those old sessions may no longer be usable. Finish or manually migrate old sessions before applying the rules in production, or temporarily keep a migration-only rule while backfilling the fields.

## Known edge cases and current behavior

- Two users can toggle the same item at nearly the same time. Each toggle is an independent claim-document write, and the calculation derives equal shares from the live claimant count, avoiding cross-user claim updates. A future transaction or callable backend function could make duplicate toggles and conflict handling fully atomic.
- An item with no claimant appears as unallocated on the calculation page and must be assigned or split by the host.
- If every item is unclaimed, there are no claimants to receive an equal split.
- Rounding can produce small differences; the settlement code assigns the remainder to the largest claimant.
- Invalid OCR prices are converted to zero and should be reviewed by the creator.
- Anthropic failures can come from missing keys, exhausted credits, unsupported models, rate limits, network errors, or malformed model JSON.
- Bill images are compressed in the browser before upload. Very large, blurry, rotated, or low-contrast receipts may still parse incorrectly.
- Duplicate display names are allowed. Person IDs, not names, identify claims.
- A browser refresh preserves identity only while its local storage remains intact.
- Anonymous auth persistence and Firestore listeners require browser storage and network access.
- The current client-side batch deletion helper is suitable for normal sessions but should be chunked if a session grows beyond Firestore's batch write limit.
- A user who has already joined can keep an old voting tab open, but the shared status listener redirects them once calculation begins.
- A session link can be forwarded to anyone. The host should delete or cancel a session if the link is shared accidentally.
- The Firestore rules protect authenticated ownership, but a user with access to a session can still read participant names and bill data by design.
- There is no permanent account recovery, cross-device participant identity, audit log, or invitation list.

## Suggested future improvements

1. Move claim updates and settlement finalization into trusted server-side callable functions or transactions.
2. Add a scheduled cleanup job for expired sessions.
3. Validate OCR output with a schema and require creator review before opening voting.
4. Add an explicit finalization state after the host finishes reallocating items.
5. Chunk large recursive deletes and add a server-side delete function.
6. Add a short host-only session token or permanent authentication if stronger identity is needed.
7. Add automated tests for settlement rounding, concurrent claims, expiry, and participant removal.
8. Add Firebase Emulator Suite tests for the Firestore rules.
