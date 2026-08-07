# truID Cordova Plugin — Integration Guide

How to add the **truID identity-verification SDK** to your own Ionic / Cordova
app — on **Android** using `cordova-plugin-truid`, and on **iOS** using the
native `TruIDPackage` Swift package alongside the same Cordova plugin. This is
the exact, verified configuration for each platform — using it as-is avoids a
long list of build and runtime issues.

The two platforms are integrated differently under the hood (Android goes
through the Cordova/JitPack dependency chain; iOS pulls a native Swift Package
directly into the Xcode project), so this guide covers them as **two separate
tracks**: [Android Integration](#android-integration) and
[iOS Integration](#ios-integration). Follow the one(s) relevant to your build
targets.

---

## 1. What you get

The plugin wraps the native truID SDK behind a single call. On Android you
invoke `launchSDK(apiKey, endPoint)` via `cordova.exec`; on iOS
the verification UI is presented directly from Swift/SwiftUI. Either way, the
SDK runs the verification flow (document capture, face liveness, ID-to-selfie,
fingerprint, etc.) in its own screen and returns a result with a **status
code**, verification status, session id, and error — see [§ truID SDK status
codes](#truid-sdk-status-codes) at the end of this guide, which applies to
both platforms.

On Android the result also carries the **captured fingerprints** (image + WSQ
template per finger) when the fingerprint step ran — see
[§6](#6-fingerprint-data-android).

---

# Android Integration

## 2. Required versions (verified working set)

Use these versions. They are known to build and run together; mixing in newer
Cordova/AGP/JDK changes the requirements substantially.

| Component | Version |
|---|---|
| Ionic | **4.x** (Angular **8.2.14**, NgModule style) |
| Node.js | **14** (e.g. 14.21.3) — required by the Angular 8 build tooling |
| Cordova CLI | **10.x** |
| cordova-android | **9.1.0** |
| JDK | **8** |
| Gradle | **6.5** (AGP 4.0.0 does not work on Gradle 7.x) |
| Android Gradle Plugin | **4.0.0** (shipped by cordova-android 9.1.0) |
| truID Android SDK | **8.1.0** (pulled from JitPack by the plugin) |

**Android SDK components required on the build machine:**
- **Platform API 30** installed (compileSdk 30). SDK 8.1.0 is built for
  compileSdk 30, so API 31 is no longer needed.
- **Build-tools that still include `dx`** (≤ `30.0.3`) — AGP 4.0.0 requires `dx`,
  which was removed in build-tools 31+.
- An **Android NDK** installed (any recent version; the plugin auto-selects it).

### What the plugin actually requires

`plugin.xml` declares the minimum Cordova gate, which `cordova plugin add`
enforces before it will install:

```xml
<engine name="cordova" version=">=10.0.0" />
<engine name="cordova-android" version=">=9.1.0" />
<engine name="cordova-ios" version=">=6.2.0" />
```

**AGP 8 is not required, and neither is a particular apply order.** The gradle
file never touches the `android { }` extension at the top level — it wraps that
work in `project.plugins.withId('com.android.application')`, because Cordova
applies plugin gradle files at a position it chooses, and on some hosts that is
before `apply plugin: 'com.android.application'`. Applying it there without the
guard fails the whole build with
`No signature of method: build_xxxxx.android()`.

The 16 KB-alignment dependency swap in `truid.gradle`
is *gated* on AGP 8.5+ **and** compileSdk 35+; on anything older it is a no-op
and CameraX/TFLite resolve exactly as your host resolves them. The truID SDK
declares androidx.camera **1.3.4**, which is what keeps AGP 4.x and 7.x hosts
building. The trade-off on those hosts is that two third-party native libraries
(`libimage_processing_util_jni.so` from CameraX, `libtensorflowlite_jni.so` from
TFLite) stay 4 KB-laid-out, so a build that must satisfy Google Play's 16 KB
page-size requirement needs AGP 8.5+ and compileSdk 35+. The SDK's own natives
are already 16 KB-aligned either way.

---

## 3. Install the plugin

Each truID SDK version has its own branch of this repo, so install the branch that
matches the SDK you want. This guide documents **`sdk-v8.1.0`** (truID Android
SDK 8.1.0), which returns the fingerprint capture data — see
[§6](#6-fingerprint-data-android).

| Plugin branch | truID Android SDK | compileSdk | Fingerprint data in the result |
|---|---|---|---|
| `sdk-v8.1.0` | 8.1.0 | **30** | yes — image **and** WSQ, both base64 |
| `sdk-v8.0.9-beta` | 8.0.9-beta | 35+ | yes — image **and** WSQ, both base64 |
| `sdk-v8.0.9` | 8.0.9 | 35+ | image base64, WSQ as a file path |
| `sdk-v8.0.6` | 8.0.6 | 35+ | no |

`sdk-v8.1.0` is a permanent fork for hosts that cannot raise `compileSdk` past 30,
not a successor to `sdk-v8.0.9-beta`. It pins AndroidX to the newest versions that
still link against the API 30 `android.jar` (core 1.6.0, activity and appcompat
1.3.1, Compose 1.1.1, CameraX 1.1.0-alpha08). On a host that can compile against
API 31 or later, use `sdk-v8.0.9-beta`.

From your project root:

```bash
cordova plugin add https://github.com/truid-ai/cordova-plugin-truid#sdk-v8.1.0
# or from a local copy:
cordova plugin add ../cordova-plugin-truid
```

The plugin automatically brings:
- the JavaScript bridge (`cordova.plugins.TruIDPlugin` / `cordova.exec`),
- the truID SDK dependency (`com.github.truid-ai:android-sdk:8.1.0`, from JitPack),
- the **dependency-version alignment** the SDK needs (compose, material, camera,
  lottie, okhttp, coroutines, etc.) so it builds under AGP 4.0.0/4.1.3,
- `android.useAndroidX=true` in the generated `gradle.properties`,
- suppression of AGP's `checkAarMetadata`, which would otherwise reject Compose
  1.1.1 and friends at compileSdk 30 (they declare `minCompileSdk=31` but carry no
  API 31 resources),
- the required Android permissions (Camera, Internet, Location).

Nothing has to be changed in the host project by hand.

---

## 4. Required Android configuration

Because cordova-android 9.1.0 predates the SDK's modern dependencies, a few
settings must be applied to the generated `platforms/android`. The plugin handles
the *dependency* side automatically; you must apply the following **project-level**
settings. (See §7 for a script that automates all of this.)

### 4.1 `config.xml` — inside `<platform name="android">`
```xml
<preference name="android-minSdkVersion" value="24" />
<preference name="AndroidXEnabled" value="true" />
```

### 4.2 `platforms/android/gradle.properties`
cordova-android 9.1.0 regenerates this file, so apply it **after**
`cordova prepare`/`platform add` and **before** building:
```
android.useAndroidX=true
android.enableJetifier=false
cdvMinSdkVersion=24
cdvTargetSdkVersion=31
cdvCompileSdkVersion=31
```

### 4.3 Pin Gradle 6.5 — `platforms/android/wrapper.gradle`
```
wrapper {
    gradleVersion = '6.5'
    distributionType = Wrapper.DistributionType.ALL
}
```

### 4.4 Live jcenter mirror
cordova-android 9.1.0 pulls two build-time artifacts from the shut-down jcenter.
Add this line after every `jcenter()` in `platforms/android/repositories.gradle`,
`platforms/android/CordovaLib/repositories.gradle`, and
`platforms/android/CordovaLib/cordova.gradle`:
```
maven { url "https://maven.aliyun.com/repository/jcenter" }
```

### 4.5 `MainActivity` must declare `android:exported`
targetSdk 31 requires it (Android 12+ rejects the install otherwise). In
`platforms/android/app/src/main/AndroidManifest.xml`, on the `MainActivity`
`<activity>` tag add:
```
android:exported="true"
```

## 5. Calling the plugin from Angular / TypeScript

The verification result arrives on a Cordova callback, which runs **outside
Angular's zone** — wrap UI updates in `NgZone.run()` so your view updates
immediately.

```ts
import { Component, NgZone } from '@angular/core';

@Component({ selector: 'app-home', templateUrl: 'home.page.html' })
export class HomePage {
  result: any = null;

  constructor(private zone: NgZone) {}

  launchTruid(): void {
    const win = window as any;
    if (!win.cordova || !win.cordova.exec) {
      alert('TruID SDK is only available in a native device build.');
      return;
    }

    win.cordova.exec(
      (res: any) => this.zone.run(() => { this.result = res; }),   // success
      (err: any) => this.zone.run(() => { this.result = { error: err, isError: true }; }),
      'TruIDPlugin',
      'launchSDK',
      ['<YOUR_API_KEY>', 'https://<your-truid-endpoint>']
    );
  }
}
```

> Fetch the API key / session token from **your backend** in production — do not
> ship a production key in the app bundle. A wrong configuration in homepage makes
> the truID server return a `"Configuration Error"`.

### Result object fields
| Field | Description |
|---|---|
| `sessionId` | truID session id — validate the outcome server-side with this |
| `verificationStatus` | textual status from the SDK |
| `statusCode` | numeric status code (see [truID SDK status codes](#truid-sdk-status-codes)) |
| `error` | error message (empty when none) |
| `hasFingerprints` | `true` when the session captured fingerprints |
| `fingerprints` | array of captured fingers, see [§6](#6-fingerprint-data-android) |

---

## 6. Fingerprint data (Android)

Requires truID Android SDK **8.0.9-beta** / **8.1.0** or newer. When the session ran the
fingerprint capture step, the result carries one entry per captured finger.

Both halves of a capture arrive inline as base64: the **finger image** for
display, the **WSQ template** for matching or upload. Nothing is read off disk,
so there is no cache lifetime to worry about.

Under the hood the SDK hands these to the plugin **in memory**, not through the
activity result intent. That matters because an intent result is parcelled
through `system_server`, whose binder buffer is roughly 1 MB shared across every
transaction in flight: a full eight-finger capture measured 780 KB and was
rejected with `TransactionTooLargeException`, which silently drops the whole
result and leaves the app looking hung. Passing references has no such ceiling,
which is also how the iOS side has always worked. The one consequence is that
the results do not survive process death — if Android kills the app while the
capture screen is showing, the result reports `hasFingerprints` but the array is
empty, and the capture has to be run again.

### Fingerprint entry fields
| Field | Description |
|---|---|
| `fingerIndex` | ANSI/NIST finger number, fixed per finger and independent of capture order: `1` right thumb, `2`–`5` right index/middle/ring/pinky, `6` left thumb, `7`–`10` left index/middle/ring/pinky |
| `fingerName` | same value as a label, e.g. `"right_index"`, `"left_thumb"` |
| `imageBase64` | the finger image, PNG encoded then base64 encoded, no `data:` prefix |
| `wsqBase64` | the WSQ template of that finger, base64 encoded |

```json
{
  "sessionId": "6f0c...",
  "verificationStatus": true,
  "statusCode": "2000",
  "error": "",
  "hasFingerprints": true,
  "fingerprints": [
    {
      "fingerIndex": 2,
      "fingerName": "right_index",
      "imageBase64": "iVBORw0KGgoAAAANSUhEUg...",
      "wsqBase64": "//qA6gAAWZgA..."
    }
  ]
}
```

### Showing the images

Prefix `imageBase64` with `data:image/png;base64,` and hand it to an `<img>`. No
extra call, no file access:

```ts
import { Component, NgZone } from '@angular/core';

@Component({ selector: 'app-home', templateUrl: 'home.page.html' })
export class HomePage {
  fingerprints: any[] = [];

  constructor(private zone: NgZone) {}

  launchTruid(): void {
    const truid = (window as any).cordova.plugins.TruIDPlugin;

    truid.launchSDK({ apiKey: '<YOUR_API_KEY>', endPoint: 'https://<your-truid-endpoint>' })
      .then((res: any) => {
        if (!res.hasFingerprints) { return; }

        // Sorting by fingerIndex gives a stable right-thumb-to-left-pinky order.
        const fingers = res.fingerprints
          .slice()
          .sort((a, b) => a.fingerIndex - b.fingerIndex)
          .map((finger: any) => ({
            index: finger.fingerIndex,
            name: finger.fingerName,
            wsq: finger.wsqBase64,        // send this to your backend
            src: 'data:image/png;base64,' + finger.imageBase64
          }));

        // The Cordova callback runs outside Angular's zone.
        this.zone.run(() => { this.fingerprints = fingers; });
      })
      .catch((err: any) => console.error('truID failed', err));
  }
}
```

```html
<div *ngFor="let finger of fingerprints">
  <p>{{ finger.index }}. {{ finger.name }}</p>
  <img [src]="finger.src" width="150" />
</div>
```

Angular's URL sanitizer already allows `data:image/*`, so no `bypassSecurityTrust`
call is needed.

### The WSQ template

`wsqBase64` is the biometric template — decode it and upload it, or forward the
base64 string as-is:

```ts
const wsqBytes = atob(finger.wsqBase64);
```

Two things to keep in mind:

- **WSQ is not an image.** `<img>` cannot display it; rendering it needs a WSQ
  decoder. Use `imageBase64` for display and `wsqBase64` for matching.
- **Read the results promptly.** They are held in memory for the session that
  just finished and are cleared when the next one starts. Copy anything you need
  to keep. For reference, a capture is roughly 90 KB of base64 per finger, about
  750 KB for eight fingers — sizeable to hold, but no longer subject to any IPC
  limit. The SDK logs the running total under the `wsq_size` tag.

The iOS side of the plugin does not report fingerprints yet: `fingerprints` comes
back as an empty array there.

---

## 7. One-command build (optional helper)

Because several §4 settings are reset by `cordova prepare`, teams usually wrap the
whole thing in a script that: builds the web bundle (Node 14) → `cordova prepare`
→ re-applies the §4.2–§4.6 patches → `gradlew assembleDebug` (JDK 8) → installs.
Run that script instead of `cordova run android`. you can use: ./run-android.sh but
first contact truID team to fetch the .sh file for both platforms.

---

# iOS Integration

Unlike Android, where the plugin pulls in a prebuilt Android SDK dependency
automatically, the iOS side of `cordova-plugin-truid` still requires you to
add truID's native Swift package to the generated Xcode project yourself. The
steps below cover that end-to-end.

## 8. Install the plugin

From your project root, same command as Android — the plugin ships hooks for
both platforms from the one package:
```bash
cordova plugin add https://github.com/truid-ai/cordova-plugin-truid
# or from a local copy:
cordova plugin add ../cordova-plugin-truid
```

## 9. Add the iOS platform and prepare it

If you haven't already added iOS as a target platform, do that first, then run
`prepare` to generate/refresh the `platforms/ios` Xcode project:
```bash
cordova platform add ios   # skip if already added
cordova prepare ios
```
This regenerates `platforms/ios/<YourApp>.xcworkspace` — open that workspace
(not the `.xcodeproj`) in Xcode for the remaining steps, since Cordova iOS
projects rely on CocoaPods/workspace structure for some plugins.

## 10. Set the minimum deployment target

In Xcode:
1. Select your project (top of the File Navigator).
2. Select your app target, then the **General** tab.
3. Under **Minimum Deployments**, set **iOS 15.1**.

truID's iOS SDK relies on newer AVFoundation/Vision APIs for liveness and
document capture, so builds targeting earlier than iOS 15.1 will fail to
compile or link.

## 11. Add the Swift Package dependencies

Add these two packages to your app target via **File → Add Package
Dependencies…**:

| Package | Dependency rule |
|---|---|
| `https://github.com/truid-ai/TruIDPackage` | branch `dib` |
| `https://github.com/Alamofire/Alamofire` | exact version `5.10.0` |

> **Verification note:** truID's public `TruIDPackage` README currently
> documents installing by **version** (`.package(url: ..., from: "4.2.0")`)
> rather than by branch, and its public branch list doesn't show a `dib`
> branch — this may be a private/preview branch your team was given access to
> separately from the public docs. If you don't have a specific reason to
> pin `dib` (e.g. truID support asked you to, for a fix not yet in a tagged
> release), consider using the version-based rule from the official README
> instead, and confirm the `dib` branch with truID's team before shipping to
> production. Alamofire `5.10.0` is a valid, real released version and safe
> to pin exactly as specified.

Steps in Xcode:
1. **File → Add Package Dependencies…**
2. Paste the package URL into the search bar.
3. For `TruIDPackage`, change the dependency rule dropdown from "Version" to
   **"Branch"** and enter `dib`.
4. For `Alamofire`, leave the rule as "Version" and set it to **Exact
   Version → 5.10.0**.
5. Make sure the target checkbox next to your app is selected before clicking
   **Add Package**.

## 12. Add required Info.plist permissions

The verification flow needs camera (and typically location) access, the same
as on Android. In `platforms/ios/<YourApp>/<YourApp>-Info.plist`, add (or
confirm) usage-description keys, otherwise iOS will silently kill the
verification screen on first camera access instead of showing a permission
prompt:
```xml
<key>NSCameraUsageDescription</key>
<string>Camera access is required to verify your identity.</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location is used as part of identity verification.</string>
```

## 13. Build the app in Xcode

With the workspace open, select a physical device or simulator and build
(<kbd>⌘B</kbd>) or run (<kbd>⌘R</kbd>). The first build after adding the
packages may take a while as Xcode resolves and compiles the SPM
dependencies.

## 14. Swift version troubleshooting

If your project's default Swift toolchain is **Swift 6.x**, the build may
fail with compiler errors coming from the truID/Alamofire package sources
(both currently expect Swift 5-era language mode). If that happens:
1. Select your app target → **Build Settings** tab.
2. Search for **"Swift Language Version"**.
3. Change it from **Swift 6** down to **Swift 5** (or, if still failing on
   very old code paths, **4.2**).
4. Clean the build folder (<kbd>⇧⌘K</kbd>) and rebuild.

This changes only the language-mode the compiler uses for your target's own
code, not your Xcode/toolchain version, so it's a safe, low-risk fix that
doesn't require downgrading Xcode itself.

---

## 15. truID SDK status codes

The `statusCode` returned in the result object.

### Success
| Code | Meaning |
|---|---|
| **1000** | Verified |

### API response errors (the API for that step returned an error)
| Code | Step |
|---|---|
| 2001 | Upload Reference Frame |
| 2002 | Upload Back Frame |
| 2003 | Upload Authentication Frame |
| 2004 | Run OCR |
| 2005 | Run ID to Selfie |
| 2006 | Upload Straight Face Frame |
| 2008 | Fingerprint Capture |
| 2009 | Fingerprint Thumb |
| 2015 | Create Session |
| 2023 | Document Authenticity |

### Retries exhausted (max attempts reached for that step)
| Code | Step |
|---|---|
| 2018 | Back Frame |
| 2019 | ID to Selfie |
| 2020 | Reference Frame |
| 2021 | Run OCR |
| 2022 | Face Frame |
 
### Session / SDK state
| Code | Meaning |
|---|---|
| 2014 | Session Expired |
| 2016 | API Not Initialized |
| 2017 | User Cancelled |