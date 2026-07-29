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
| truID Android SDK | **8.0.6** (pulled from JitPack by the plugin) |

**Android SDK components required on the build machine:**
- **Platform API 31** installed (compileSdk 31).
- **Build-tools that still include `dx`** (≤ `30.0.3`) — AGP 4.0.0 requires `dx`,
  which was removed in build-tools 31+.
- An **Android NDK** installed (any recent version; the plugin auto-selects it).

---

## 3. Install the plugin

From your project root:

```bash
cordova plugin add https://github.com/truid-ai/cordova-plugin-truid
# or from a local copy:
cordova plugin add ../cordova-plugin-truid
```

The plugin automatically brings:
- the JavaScript bridge (`cordova.plugins.TruIDPlugin` / `cordova.exec`),
- the truID SDK dependency (`com.github.truid-ai:android-sdk:8.0.6`, from JitPack),
- the **dependency-version alignment** the SDK needs (compose, material, camera,
  lottie, okhttp, coroutines, etc.) so it builds under AGP 4.0.0,
- the required Android permissions (Camera, Internet, Location).

---

## 4. Required Android configuration

Because cordova-android 9.1.0 predates the SDK's modern dependencies, a few
settings must be applied to the generated `platforms/android`. The plugin handles
the *dependency* side automatically; you must apply the following **project-level**
settings. (See §6 for a script that automates all of this.)

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

---

## 6. One-command build (optional helper)

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

## 7. Install the plugin

From your project root, same command as Android — the plugin ships hooks for
both platforms from the one package:
```bash
cordova plugin add https://github.com/truid-ai/cordova-plugin-truid
# or from a local copy:
cordova plugin add ../cordova-plugin-truid
```

## 8. Add the iOS platform and prepare it

If you haven't already added iOS as a target platform, do that first, then run
`prepare` to generate/refresh the `platforms/ios` Xcode project:
```bash
cordova platform add ios   # skip if already added
cordova prepare ios
```
This regenerates `platforms/ios/<YourApp>.xcworkspace` — open that workspace
(not the `.xcodeproj`) in Xcode for the remaining steps, since Cordova iOS
projects rely on CocoaPods/workspace structure for some plugins.

## 9. Set the minimum deployment target

In Xcode:
1. Select your project (top of the File Navigator).
2. Select your app target, then the **General** tab.
3. Under **Minimum Deployments**, set **iOS 15.1**.

truID's iOS SDK relies on newer AVFoundation/Vision APIs for liveness and
document capture, so builds targeting earlier than iOS 15.1 will fail to
compile or link.

## 10. Add the Swift Package dependencies

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

## 11. Add required Info.plist permissions

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

## 12. Build the app in Xcode

With the workspace open, select a physical device or simulator and build
(<kbd>⌘B</kbd>) or run (<kbd>⌘R</kbd>). The first build after adding the
packages may take a while as Xcode resolves and compiles the SPM
dependencies.

## 13. Swift version troubleshooting

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

## 14. truID SDK status codes

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