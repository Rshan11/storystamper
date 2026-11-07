# StoryStamper for iPhone → TestFlight

A native SwiftUI app with:
- Email + password sign-in, and **Sign in with Apple**
- Pick or paste a screenshot → verdict, reasons and sources → stamped image you can share or save
- **Share extension**: in Photos (or any app), tap Share → **StoryStamper**
- Account screen with daily usage, sign out, **delete account** (Apple requires this)

The Xcode project is generated from `project.yml` with XcodeGen, so there's no fragile
`.xcodeproj` to merge.

---

## Before you start

- [ ] Backend deployed with the D1 database (see the main README). The app talks to
      `https://storystamper.ryan-b00.workers.dev`. If that URL changes, edit `Shared/Config.swift`.
- [ ] Mac with Xcode 16 or newer, signed in to your Apple ID (Xcode → Settings → Accounts)
- [ ] Paid Apple Developer Program membership
- [ ] Homebrew (https://brew.sh)

---

## Step 1: Set your Team ID

1. Find your Team ID: https://developer.apple.com/account → **Membership details** → Team ID (10 characters).
2. Open `ios/Config/Signing.xcconfig` and fill in:
   ```
   DEVELOPMENT_TEAM = ABCDE12345
   ```
3. Bundle ID defaults to `com.storystamper.app`. If Apple says it's taken (Step 3), pick another
   (e.g. `com.powderrivermasonry.storystamper`) and change it in **both**
   `ios/Config/Signing.xcconfig` (`APP_BUNDLE_ID`) and `worker/wrangler.toml` (`APPLE_BUNDLE_ID`),
   then redeploy the worker. Otherwise Sign in with Apple will be rejected.

## Step 2: Generate and open the project

```bash
brew install xcodegen
cd ios
xcodegen
open StoryStamper.xcodeproj
```

Re-run `xcodegen` any time you pull changes that add or remove files.

In Xcode, click the **StoryStamper** project → each target (**StoryStamper** and **ShareExtension**)
→ **Signing & Capabilities**. Check that **Automatically manage signing** is on and your team is
selected. Xcode registers the bundle IDs, the App Group and Sign in with Apple for you.

Run it on your phone (select your iPhone at the top, press ▶). The first time, iOS asks you
to trust the developer: **Settings → General → VPN & Device Management**.

## Step 3: Create the app in App Store Connect

1. https://appstoreconnect.apple.com → **Apps** → **+** → **New App**
2. Platform **iOS**, Name `StoryStamper` (must be unique on the App Store. If it's taken, try
   `StoryStamper: Fact Check`), language English, Bundle ID **com.storystamper.app**
   (it appears after Step 2 has run once), SKU `storystamper-ios`.
3. Under **App Information**, set **Privacy Policy URL**:
   `https://storystamper.ryan-b00.workers.dev/privacy`

## Step 4: Upload a build

1. In Xcode, set the run destination (top bar) to **Any iOS Device (arm64)**.
2. **Product → Archive**. When the Organizer opens: **Distribute App** → **App Store Connect** → **Upload**.
3. Wait 5–20 minutes for the email saying the build has finished processing.

For every later upload, bump `CURRENT_PROJECT_VERSION` in `Config/Signing.xcconfig` (2, 3, 4…),
re-run `xcodegen`, and archive again. Encryption export compliance is pre-answered in
Info.plist, so you won't be asked.

## Step 5: TestFlight

**Internal testers (no review, up to 100 people on your App Store Connect team):**
App Store Connect → your app → **TestFlight** → **Internal Testing** → **+** → add yourself.
Install the **TestFlight** app on your iPhone and accept the invite.

**External testers (friends, family; needs a quick Beta App Review):**
1. TestFlight → **External Testing** → **+** → create a group → add the build.
2. Fill in **Test Information**: what to test, contact email, and a **demo account** for Apple's
   reviewer. Create one:
   ```bash
   # make an invite code, then sign up at /login with it, e.g. appreview@yourdomain.com
   curl -X POST https://storystamper.ryan-b00.workers.dev/api/admin/invites \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" \
     -d '{"count":1,"note":"apple review"}'
   ```
   Then give Apple that email and password.
3. Once approved (usually within a day), add testers by email or turn on a **public link**.
   Each tester also needs an invite code to create an account, or they can sign in with the
   demo account.

---

## Optional: revoke Apple sign-ins on account deletion

App Store review expects that deleting an account also revokes Sign in with Apple. TestFlight
doesn't require it, but set it up before a public release:

1. https://developer.apple.com/account/resources/authkeys/list → **+** → name it
   "StoryStamper SIWA" → check **Sign in with Apple** → **Configure** → pick the StoryStamper
   App ID → Save → **Continue** → **Register** → **Download** the `.p8` file (one-time download!).
2. Note the **Key ID** shown, and your **Team ID**.
3. ```bash
   cd worker
   npx wrangler secret put APPLE_TEAM_ID        # your Team ID
   npx wrangler secret put APPLE_KEY_ID         # the Key ID
   npx wrangler secret put APPLE_PRIVATE_KEY < ~/Downloads/AuthKey_XXXXXXXXXX.p8
   ```
   The worker then keeps a refresh token at Apple sign-in and revokes it when the account is deleted.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "No account for team" / signing errors | Xcode → Settings → Accounts → add your Apple ID; select the team on **both** targets |
| "Sign in with Apple failed" | `APPLE_BUNDLE_ID` in `worker/wrangler.toml` must exactly match the app's bundle ID; redeploy the worker |
| Share extension says "Sign in first" after signing in | Both targets must have the same App Group (`group.<bundle id>`) under Signing & Capabilities |
| StoryStamper missing from the Share sheet | Scroll the app row in the share sheet → **More** → enable StoryStamper |
| Upload rejected: build number already used | Bump `CURRENT_PROJECT_VERSION`, re-run `xcodegen`, archive again |
| Compile error after pulling changes | Re-run `xcodegen` |

## Project layout

```
project.yml                  XcodeGen spec (targets, Info.plist, entitlements)
Config/Signing.xcconfig      Team ID, bundle ID, version numbers  ← edit this
Shared/                      Code used by the app AND the Share extension
  Config.swift               Backend URL
  APIClient.swift            Talks to the worker
  Keychain.swift             Stores the session token (shared via App Group)
  Stamp.swift                Draws the verdict stamp
  ResultDetails.swift        Verdict, reasons and sources UI
StoryStamper/                The app
  AuthStore.swift            Sign-in state, Sign in with Apple
  Views/                     Login, Check, Account screens
ShareExtension/              "Share → StoryStamper"
```
