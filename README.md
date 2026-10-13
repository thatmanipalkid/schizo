# thatmanipalkid

`thatmanipalkid` is a mobile-first, link-based restaurant bill-splitting web app. A host creates a session, enters or scans a bill, and shares a link or QR code. Participants join with a display name, select the items they shared, and confirm when they are done. The host then reviews the participants and opens a live settlement view.

The app uses Next.js App Router, React, TypeScript, Firebase Anonymous Authentication, Cloud Firestore, and the Gemini API for bill-image extraction. It does not require Google sign-in and does not collect or transfer payments.

## Contents

- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Environment configuration](#environment-configuration)
- [Firebase project setup](#firebase-project-setup)
- [Build and diagnostics](#build-and-diagnostics)
- [Application routes](#application-routes)
- [End-to-end sample flow](#end-to-end-sample-flow)
- [Bill image extraction](#bill-image-extraction)
- [Firestore data model](#firestore-data-model)
- [Live data and identity](#live-data-and-identity)
- [Settlement rules](#settlement-rules)
- [Authorization and privacy](#authorization-and-privacy)
- [Repository layout](#repository-layout)
- [Limitations and operational notes](#limitations-and-operational-notes)
- [Deployment](#deployment)

## Requirements

- Node.js 18.17 or newer (Node.js 20 LTS is a good default).
- npm.
- A Firebase project with Cloud Firestore and Anonymous Authentication enabled.
- A Gemini API key to use bill-image extraction. Manual item entry does not depend on Gemini.

The repository does not currently define a test script or include a unit/integration test suite. The available package scripts are `dev`, `build`, `start`, and `lint`.

## Run locally

From the repository root:

```bash
npm ci
cp .env.example .env.local
# Edit .env.local and enter the values for your Firebase project and Gemini key.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If the port is already occupied, Next.js may offer another local port; use the URL printed by the development server.

`npm ci` installs the exact dependency versions recorded in `package-lock.json`. Use `npm install` when intentionally changing dependencies.

## Environment configuration

Create `.env.local` in the project root. `.env.local` is ignored by Git; do not commit it.

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
GEMINI_API_KEY=
```

The Firebase values come from the Firebase project's registered web app. `GEMINI_API_KEY` is read only by the server route at `/api/ocr`. It must not be renamed to a `NEXT_PUBLIC_` variable or embedded in client code. The Firebase web-app configuration is delivered to the browser by design; restrict the Firebase API key using Google's API restrictions where practical, and rely on Firestore rules for data authorization.

Next.js inlines `NEXT_PUBLIC_*` values during the build. Configure them in the environment that runs `npm run build`, and rebuild/redeploy after changing them. Missing Firebase values can allow compilation to proceed but the application will not be able to initialize a working Firebase client. Bill parsing returns an explicit missing-key response when `GEMINI_API_KEY` is unavailable.

## Firebase project setup

1. Create or select a Firebase project.
2. Create a Cloud Firestore database.
3. In **Authentication → Sign-in method**, enable **Anonymous** sign-in.
4. Register a web app in Firebase project settings and copy its configuration into `.env.local`.
5. Apply the contents of [`firestore.rules`](./firestore.rules) in **Firestore Database → Rules** in the Firebase console.
6. Restart the local Next.js process after changing `.env.local`.

The repository currently contains `firestore.rules` but no Firebase CLI configuration file. To deploy the rules with the Firebase CLI, first configure the CLI for the project and make sure its `firebase.json` maps Firestore rules to this file. Otherwise, paste the rules into the Firebase console.

The client signs users in anonymously through `ensureAnonymousAuth()` before it starts Firestore listeners or writes session data. No Google OAuth provider is used.

## Build and diagnostics

Available project commands:

```bash
npm run dev       # Local development server
npm run lint      # Next.js ESLint checks
npm run build     # Production Next.js build
npm run start     # Serve an already-built production app
npx tsc --noEmit  # TypeScript type-check without emitting files
```

Run the production build from the project root:

```bash
npm run build
```

For a useful failure report, capture the complete output from the first error through the final exit code. The first compiler or configuration error is usually more informative than subsequent errors. Check the environment and installation when diagnosing:

```bash
node --version
npm --version
npm ci
npx tsc --noEmit
npm run lint
npm run build
```

Notes when investigating a build failure:

- Confirm the terminal is in the repository root and the installed Node version satisfies the requirement above.
- If `npm ci` fails, retain the full npm error. Do not delete or regenerate the lockfile as a first response.
- Separate TypeScript/lint errors from Next.js build errors. `npx tsc --noEmit` and `npm run lint` are distinct checks; a passing type check does not prove the production bundle builds.
- If the build fails during page-data collection or prerendering, inspect the stack trace for modules that access browser-only APIs (`window`, `document`, or browser storage) during server rendering.
- Check that required `NEXT_PUBLIC_FIREBASE_*` values exist in the build environment. Ensure server-only keys such as `GEMINI_API_KEY` are not accidentally exposed to the client.
- If a command appears to hang, record whether it prints any output, how long it waits, the process exit status, and whether another dev/build process is already running. A stalled process without an error is not enough evidence to identify a code defect.

No cause for a build failure is documented here because a specific `npm run build` error and stack trace are needed to determine the cause.

## Application routes

| Route | Responsibility |
| --- | --- |
| `/` | Create a draft session and register the creator as the host. |
| `/session/[id]/host` | Host bill setup: manual item editing, bill image upload, tax/service/discount, and opening the session. |
| `/session/[id]/join` | Show the session join URL/QR code and let a guest join while the session is open. The host lands here after opening a draft. |
| `/session/[id]/vote` | Live item claims, participant presence, and voting completion. |
| `/session/[id]/settle` | Host participant review and calculation controls; live per-person settlement for all participants. |
| `/session/[id]/left` | Confirmation after opting out of a session. |
| `/api/ocr` | Server route that validates the request, calls Gemini 2.5 Flash, and normalizes bill data. |
| `/api/parse-bill` | Separate text-extraction parsing endpoint. The current host image-upload flow calls `/api/ocr`, not this route. |

The session status is stored in Firestore:

| Status | Meaning in the current UI |
| --- | --- |
| `draft` | Host is setting up the bill. Guests cannot join yet. |
| `open` | Guests can join and participants can claim items. |
| `calculating` | Host has confirmed the participant list; settlement results are shown and unclaimed items can be allocated. |
| `settled` | Also renders the calculation view. The normal flow currently opens `calculating`; it does not need to transition to `settled`. |
| `expired` | The shared session hook presents an expired state when a draft/open session's `expiresAt` has passed. |
| `cancelled` | The session is cancelled and its regular flows are blocked. |

## End-to-end sample flow

This is a manual acceptance scenario for exercising the main user journey after Firebase is configured:

1. On `/`, enter a host name such as `Asha` and a restaurant name such as `Cafe Example`; create the session.
2. On the host setup page, add `Masala dosa` at ₹180 and `Paneer tikka` at ₹320. These values represent line totals (see [Price and quantity semantics](#price-and-quantity-semantics)).
3. Enter ₹50 tax, ₹30 service charge, and ₹20 discount. The displayed bill total should be ₹560.
4. Open the session. The session status changes from `draft` to `open`, and the host is directed to the join page.
5. Open the shared join link in a second browser/profile. Join as `Bala`.
6. As the host, claim `Masala dosa`. As Bala, claim both items. Each user selects **See split** when finished.
7. Back on the host, review the participant list. When every participant—including the host—has marked voting complete, confirm the calculation.
8. Both participants should see a live result. With these claims and charges, the rounded shares should total ₹560: Asha ₹126 and Bala ₹434.

This scenario assumes the host and guest are separate anonymous-authenticated browser identities. It tests the UI and Firestore interaction end to end; it is not an automated test and requires working Firebase configuration/rules.

## Bill image extraction

The current host upload flow is implemented by [`lib/ocr.ts`](./lib/ocr.ts) and [`app/api/ocr/route.ts`](./app/api/ocr/route.ts):

1. The browser accepts image files, including PNG, JPEG, WebP, HEIC, and HEIF.
2. HEIC/HEIF is converted to JPEG using `heic2any` when possible, with a browser-native decode fallback.
3. Images are resized so the longest side is at most 2400 pixels and encoded as JPEG.
4. The browser sends base64 image data to `/api/ocr`. Each selected image is extracted sequentially; the results are combined.
5. The server sends the image and a constrained JSON extraction prompt to Gemini 2.5 Flash using the server-only `GEMINI_API_KEY`.
6. The response is normalized into item rows (`name`, `quantity`, `price`) and nullable subtotal/tax/service/total fields.
7. After all selected images succeed, one Firestore batch replaces the existing bill items and updates tax, service charge, discount, and bill total. Discount is reset to zero by this upload operation.
8. The host reviews the extracted data and the visible total, edits as needed, then opens voting.

The OCR prompt defines each item's `price` as the **amount for the whole line**, not the unit rate. If more than one photo is selected, all extracted rows and monetary amounts are summed; avoid selecting overlapping images of the same receipt section or rows may be duplicated. A failed image extraction prevents the batch update, and the page shows an error. Extraction is not a substitute for checking the original receipt.

The route currently logs the raw model response and the client logs normalized bill data for debugging. These logs may contain item names and prices; review/remove such logging before using production logging systems with stricter data-minimization requirements.

## Firestore data model

```text
sessions/{sessionId}
  restaurantName: string
  createdAt: timestamp
  expiresAt: timestamp
  status: draft | open | calculating | settled | expired | cancelled
  hostUid: Firebase anonymous-auth UID
  taxAmount: number
  serviceChargeAmount: number
  discountAmount: number
  billTotal: number

sessions/{sessionId}/people/{personId}
  name: string
  joinedAt: timestamp
  isHost: boolean
  authUid: Firebase anonymous-auth UID
  isDoneVoting: boolean
  lastSeen: timestamp

sessions/{sessionId}/items/{itemId}
  name: string
  price: number                 # whole line amount
  quantity: number | optional  # informational; not multiplied into price
  category: veg | non-veg | drink | other

sessions/{sessionId}/claims/{claimId}
  itemId: string
  personId: string
  shareFraction: number
```

The TypeScript interfaces are in [`lib/types.ts`](./lib/types.ts). Item categories and name classification are in [`lib/itemCategory.ts`](./lib/itemCategory.ts). Claims are stored as separate documents under each session, not nested into item/person records.

## Live data and identity

[`lib/useSessionLive.ts`](./lib/useSessionLive.ts) subscribes to the session document and its `items`, `people`, and `claims` subcollections with Firestore `onSnapshot` listeners. Connected pages therefore update as other participants join, claim items, finish voting, or when the host changes the session status.

[`lib/identity.ts`](./lib/identity.ts) stores a session-specific `personId`, display name, and host UI flag in `window.sessionStorage`. A refresh in the same tab retains that browser's participant identity; a new tab/session-storage context may require joining again. Firestore's `authUid` and `hostUid` are the backend identity checks; the locally stored `isHost` flag is not an authorization credential.

The voting page updates `lastSeen` approximately every five seconds while open. The UI has presence-related cleanup behavior, but clients can close abruptly or go offline, so presence should not be treated as a durable attendance record.

## Settlement rules

The calculation lives in [`lib/settlement.ts`](./lib/settlement.ts) and is recomputed from the current live items, people, claims, and session charges.

For each item, the implementation counts distinct valid claimant documents and divides the item's line price equally between those claimants. A person's raw item subtotal is the sum of those item shares. The current fee/discount behavior is:

- Tax is divided equally among all current people.
- Service charge is divided equally among all current people.
- Discount is allocated in proportion to each person's raw item subtotal.
- Each final amount is clamped at zero and rounded to the nearest whole rupee.
- The difference between the calculated bill total and the sum of rounded person totals is assigned to the person with the largest total, if that adjustment does not make their total negative.
- The calculation warns in the console if the leftover exceeds five rupees. A remaining mismatch can occur when an adjustment would make the selected person's amount negative.

The bill total used by host setup is:

```text
max(0, sum(item line prices) + tax + service charge - discount)
```

The OCR response includes a receipt `total`, but opening the session recalculates `billTotal` from the editable item rows and charges. If the printed receipt includes an additional fee, round-off, or other amount not represented in those fields, reconcile the values manually before opening.

### Price and quantity semantics

`price` is the whole item's **line amount**. The settlement helper intentionally does not multiply by `quantity`. For example, if the receipt says quantity 2 and line amount ₹300, save `price: 300` and `quantity: 2`; the bill contributes ₹300, not ₹600. The optional quantity is displayed as receipt/context data and does not alter the split. Entering a unit price instead of a line amount will understate the bill.

### Unclaimed items

An item with no claims is excluded from per-person item subtotals and reported as unclaimed. In the calculation view, the host can assign individual unclaimed items to a participant or split all unclaimed items among the existing claimants. If there are no claimants, an equal split cannot be created. Settlement results are live, so they recalculate after claim/assignment writes.

The `shareFraction` property is written on claims for compatibility with split operations, but the current calculation divides equally by the number of valid claimant documents; it does not calculate weighted shares from `shareFraction`.

## Authorization and privacy

[`firestore.rules`](./firestore.rules) is the authorization boundary for client Firestore operations. It requires Firebase authentication to read session data, uses `hostUid` to authorize host session/item operations, requires a participant record to be associated with the caller's `authUid` for participant claim writes, and permits host participant cleanup.

Important consequences:

- Anonymous Authentication is not a permanent user account. Clearing browser state or switching devices can produce a new UID and does not provide account recovery.
- A client-side route check or session-storage value is for UX only; it is not a security boundary.
- A user who knows a session ID and can authenticate can read that session's Firestore data under the current rules. Treat the shared session URL as sensitive and only share it with intended participants.
- Participant names, bill items, claims, and computed settlement details are visible to signed-in clients with access to the session by design.
- The rules do not provide per-field schema validation or rate limiting. Review and test rule changes in the Firebase Rules simulator or Emulator Suite before deploying them.
- Session creation/profile creation is performed by client code. Protect the Firebase project with appropriate quotas and monitor unexpected usage.
- Do not store payment credentials or secrets in Firestore documents or client-visible environment variables.

## Repository layout

```text
app/
  page.tsx                      # Session creation
  layout.tsx                    # Root document and metadata
  api/
    ocr/route.ts                 # Gemini image extraction API
    parse-bill/route.ts          # Text-based bill parser endpoint
  session/[id]/
    host/page.tsx                # Draft bill setup
    join/page.tsx                # QR/link and participant join
    vote/page.tsx                # Live claims and completion
    settle/page.tsx              # Host review and settlement display
    left/page.tsx                # Opt-out confirmation
components/
  ui.tsx                         # Shared UI controls and layout primitives
lib/
  firebase.ts                    # Firebase app, Auth, Firestore initialization
  identity.ts                    # Session-scoped browser identity
  useSessionLive.ts               # Firestore snapshot subscriptions
  sessionWrites.ts                # Presence, claims, status, and cleanup writes
  ocr.ts                         # Browser-side image prep and OCR client
  settlement.ts                  # Bill/participant settlement calculations
  itemCategory.ts                # Food category values, matching, sorting
  format.ts                      # Formatting and numeric input helpers
  types.ts                       # Shared domain types
firestore.rules                  # Firestore client authorization rules
.env.example                     # Environment variable names
```

The text parser at `/api/parse-bill` accepts extracted text; it is separate from the Gemini image route and is not called by the current host upload component.

## Limitations and operational notes

- There is no payment gateway, UPI handoff, payment collection, or payment confirmation.
- There is no automated test script or test suite in the package configuration at this time.
- Session expiry is evaluated lazily by the client when it observes the session; there is no scheduled server cleanup job.
- OCR output is best-effort. Blurry, rotated, cropped, low-contrast, or overlapping receipt photos can produce missing, duplicated, or incorrect rows. Verify extracted amounts manually.
- Multiple uploaded photos are combined by summing their extracted line items and totals. Duplicate coverage is not automatically detected.
- The host upload applies its item/session writes in one Firestore batch. Firestore imposes a maximum number of writes per batch; very large receipts can exceed that limit.
- Manual add rejects a blank item name or a price that parses to zero or less. Numeric parsing and edit inputs are otherwise intentionally lightweight; check amounts, quantities, tax, service, and discount before opening.
- The cleanup helpers use client-side batches and are intended for normal small sessions, not arbitrarily large collections.
- Duplicate display names are allowed; participant document IDs distinguish users.
- Network access, browser storage, Firebase Auth, Firestore rules, and correct environment configuration are required for a full session.

## Deployment

Deploy as a Next.js application (for example, on Vercel). Configure all six `NEXT_PUBLIC_FIREBASE_*` variables in the deployment environment before the build. Configure `GEMINI_API_KEY` as a server-side environment variable for deployments that enable image extraction. Redeploy after changing build-time public environment values.

Before release:

1. Run `npm ci`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` in the deployment-equivalent environment.
2. Apply and review Firestore rules against the intended Firebase project.
3. Run the sample flow in [End-to-end sample flow](#end-to-end-sample-flow) with separate host and guest browser identities.
4. Upload a representative receipt and compare each extracted line amount, tax, service charge, and total to the original.
5. Confirm the session link and the server-side Gemini key are handled as described above.
