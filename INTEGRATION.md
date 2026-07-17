# Integrating cordova-plugin-truid into an Ionic 4 / Cordova 10 App

This plugin wraps the native **TruID identity-verification SDK** (document capture, face liveness, ID-to-selfie matching, fingerprint capture) behind a single JavaScript call. It has been verified end-to-end on physical Android and iOS devices with an Ionic 4 (Angular 8) / Cordova 10 host app.

```js
const result = await cordova.plugins.TruIDPlugin.launchSDK({
  apiKey: '<your TruID API key>',
  endPoint: 'https://staging-api.truid.ai',   // or production endpoint
  applicationId: 12345
});
// result: { sessionId, verificationStatus, error, statusCode }
```

---

## 1. Requirements

| Requirement | Version | Why |
|---|---|---|
| Cordova CLI | 10.x | plugin engine range |
| cordova-android | 10.x | tested platform |
| cordova-ios | 6.2+ | needed for the `scheme` preference (see §4) |
| **JDK** | **17 or newer** | the SDK's dependencies require Android Gradle Plugin 8, which needs JDK 17+. **JDK 8/11 will not work** even though stock Cordova 10 uses them. |
| Android SDK | Platform 35 installed | compile/target SDK |
| Xcode (iOS) | recent, with CocoaPods not required | SDK ships as Swift Packages |
| iOS deployment target | 13.0+ | the SDK's UI is SwiftUI |

---

## 2. Install the plugin

```bash
cordova plugin add https://github.com/TZK7/cordova-plugin-truid.git
```

or from a local copy/zip:

```bash
cordova plugin add ../cordova-plugin-truid
```

The plugin automatically brings with it:

- the JS bridge (`cordova.plugins.TruIDPlugin`),
- the Android SDK dependency (`com.github.truid-ai:android-sdk:8.0.1` from public JitPack) and required Android permissions,
- iOS `Info.plist` usage descriptions (override the texts with `--variable CAMERA_USAGE_DESCRIPTION="..."` etc. at install time),
- a build hook that makes cordova-android 10's generated projects compatible with AGP 8 (injects the required `namespace` into `CordovaLib` and the app module — no action needed on your side).

---

## 3. Android configuration

Add these preferences inside `<platform name="android">` in your app's `config.xml` (Cordova only reads build preferences from the app, a plugin cannot set them for you):

```xml
<preference name="android-minSdkVersion" value="24" />
<preference name="android-targetSdkVersion" value="35" />
<preference name="AndroidXEnabled" value="true" />
<preference name="GradleVersion" value="8.7" />
<preference name="AndroidGradlePluginVersion" value="8.6.1" />
<preference name="GradlePluginKotlinVersion" value="1.9.24" />
```

Then build with **JDK 17+** (`JAVA_HOME` must point at it):

```bash
cordova platform add android   # or: cordova prepare android, if already added
cordova build android
cordova run android --device
```

> If your app already targets different SDK/Gradle versions, the values above are the minimums the TruID SDK needs — raising yours is fine, lowering is not.

---

## 4. iOS configuration

### 4.1 config.xml preferences

Inside `<platform name="ios">`:

```xml
<preference name="deployment-target" value="13.0" />
```

**If your `index.html` uses `<base href="/">`** (all standard Ionic Angular apps do), you must also serve the webview from a scheme+host origin, otherwise the app renders a blank white screen under cordova-ios's default `file://` loading:

```xml
<preference name="scheme" value="app" />
<preference name="hostname" value="localhost" />
```

> ⚠️ If your app is already shipping, note that changing the scheme changes the WebView origin, which resets `localStorage`/IndexedDB contents on first launch after the update. Plan a migration if you persist data there.

### 4.2 Swift Packages (one-time manual step)

The TruID iOS SDK is distributed as **Swift Packages** (not CocoaPods), and Cordova cannot declare SPM dependencies. After `cordova platform add ios`:

1. Open `platforms/ios/*.xcodeproj` (or `.xcworkspace` if present) in Xcode.
2. Project → **Package Dependencies** → **+** → add each of:
   - `https://github.com/truid-ai/TruIDPackage` — version **1.8.1** (or latest 1.8.x)
   - `https://github.com/truid-ai/T5AirSnapPackage` — latest
   - `https://github.com/airbnb/lottie-ios` — **3.4.0**
   - `https://github.com/Alamofire/Alamofire` — **5.6.2** or later 5.x
3. Attach each package's product to your **app target** when prompted.
4. Set your signing team (Signing & Capabilities) and run on a device.

> ⚠️ These packages live in `platforms/ios/`, which is normally gitignored. If you remove and re-add the ios platform, repeat this step.

The simulator is not useful for testing — camera and fingerprint flows need a real device.

---

## 5. Using the plugin from Angular/TypeScript

Copy [`examples/truid.ts`](examples/truid.ts) into your app (e.g. `src/app/services/truid.ts`) — it provides a typed, promise-based facade that resolves the plugin lazily (safe to import before `deviceready`):

```typescript
import { TruIDPlugin, LaunchOptions, LaunchResult } from './truid';

async startVerification() {
  try {
    const result: LaunchResult = await TruIDPlugin.launchSDK({
      apiKey: this.truidApiKey,          // fetch from YOUR backend - see §6
      endPoint: 'https://staging-api.truid.ai',
      applicationId: 12345
    });
    // result.sessionId -> send to your backend to fetch the verification outcome
  } catch (err) {
    // token generation failed, user cancelled, or plugin unavailable (browser)
  }
}
```

A complete reference page (button, spinner, success/error cards) is in [`examples/`](examples) — adapt the import paths to your project structure.

**Result fields:** `sessionId` (use server-side to fetch verification data), `verificationStatus`, `statusCode`, `error` (empty string when none). In a desktop browser the promise rejects with `TruIDPlugin not available` — expected, the SDK exists only in device builds.

**Enabled verification steps** (document front+back capture, server-side face liveness, ID-to-selfie matching, fingerprint capture LEFT_4+RIGHT_4 at NIST ≥ 30, help screens) are currently fixed inside the native code — `src/android/TruIDPlugin.java` (`AuthenticateWithTruID.Input`) and `src/ios/TruIDPlugin.swift` (`TruidMain`). Adjust the flags there if your flow differs; the flags are positional, so keep the order intact.

---

## 6. Security

- **Do not ship a production API key in the app bundle.** The in-plugin call to `{endPoint}/generate-token/` exists for development convenience; in production, mint the session token on **your backend** (TruID's docs state token generation should be server-side) and pass it down.
- Treat `sessionId` as the only client-trusted output — fetch and validate the actual verification result from TruID on your backend before granting anything.
- All traffic is HTTPS; the plugin adds no cleartext exceptions.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `TruIDPlugin not available` in a desktop browser | Expected — native SDK only exists in device builds. |
| `TruIDPlugin not available` on a device | Plugin not actually installed: check `cordova plugin list` and that `platforms/<p>/www/cordova_plugins.js` contains `TruIDPlugin`; re-run `cordova plugin add` and watch for install errors (Cordova silently reverts failed plugin installs). |
| Android: `Namespace not specified` | The plugin's hook didn't run — re-run `cordova prepare android`; check `hooks/android-agp8-namespace.js` exists under `plugins/cordova-plugin-truid/`. |
| Android: `Unsupported class file major version ...` | Your JDK and Gradle disagree. Build with JDK 17+, and your *system* Gradle (used once to generate the wrapper) must be ≥ 7.3. |
| Android: cannot resolve `com.github.truid-ai:android-sdk` | Network/proxy to `jitpack.io` — the artifact is public. |
| iOS: blank white screen | Missing `scheme`/`hostname` preferences (§4.1). |
| iOS: `No such module 'TruID'` | Swift Packages not added to the app target (§4.2). |
| Token generation fails (401/403) | API key / endpoint mismatch (staging key vs production URL or vice versa). |
| SDK crashes at launch citing a null parameter | Don't pass `null` for `accountType` — keep the empty-string default in the native code. |

---

## 8. Version compatibility (as tested)

| Component | Version |
|---|---|
| cordova-plugin-truid | 1.1.0 |
| TruID Android SDK | `com.github.truid-ai:android-sdk:8.0.1` |
| TruID iOS package | `truid-ai/TruIDPackage` 1.8.1 |
| Host app | Ionic 4.11 / Angular 8.1 / Cordova CLI 10 / cordova-android 10.1.2 / cordova-ios 6.x |

The SDK's native constructors (`AuthenticateWithTruID.Input` on Android, `TruidMain` on iOS) are **positional and change between SDK versions** — when bumping the SDK, expect to re-verify those calls in the plugin's native sources.
