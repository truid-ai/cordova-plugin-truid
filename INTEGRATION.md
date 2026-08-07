# truID Cordova plugin — integration

Plugin branch `sdk-v8.1.0-beta`, truID Android SDK **8.1.0-beta**.

This build exists for host apps that cannot raise `compileSdk` past 30. On a host that
can compile against API 31 or later, use the modern plugin branch instead.

---

## 1. Versions

### Host toolchain this was built and tested against

| Component | Version |
|---|---|
| Cordova CLI | 10.0.0 (cordova-lib 10.1.0) |
| cordova-android | 9.1.0 |
| Android Gradle Plugin | 4.1.3 |
| Gradle | 6.5 (`gradle-6.5-all.zip`) |
| compileSdk | 30 |
| targetSdk | 30 |
| build-tools | 30.0.3 |
| JDK | 8 |
| minSdk | 23 or higher |

`build-tools` must stay at **30.0.3 or lower**. AGP 4.x requires `dx`, which was removed in
build-tools 32, so a newer build-tools fails with
`Installed Build Tools revision … is corrupted`.

### truID SDK

| | |
|---|---|
| Artifact | `com.github.truid-ai:android-sdk:8.1.0-beta` |
| Source | JitPack (the plugin adds the repository) |
| minSdk | 23 |
| Bytecode | Java 8 |

### Dependency versions the plugin pins

The plugin fixes these in the host build. They are the newest releases that still link
against the API 30 `android.jar`, so nothing here needs to be set or changed by the host.

| Dependency | Version |
|---|---|
| `androidx.core:core`, `core-ktx` | 1.6.0 |
| `androidx.appcompat:appcompat` | 1.3.1 |
| `androidx.activity:activity`, `activity-ktx`, `activity-compose` | 1.3.1 |
| `androidx.fragment:fragment` | 1.3.6 |
| `androidx.savedstate:savedstate` | 1.1.0 |
| `androidx.lifecycle:*` | 2.4.0 |
| `androidx.arch.core:core-runtime` | 2.1.0 |
| `androidx.compose.*` | 1.1.1 |
| `androidx.navigation:*` | 2.4.2 |
| `com.google.android.material:material` | 1.4.0 |
| `androidx.camera:camera-core`, `camera-camera2`, `camera-lifecycle` | 1.1.0-alpha08 |
| `androidx.camera:camera-view` | 1.0.0-alpha28 |
| `com.airbnb.android:lottie-compose` | 6.0.0 |

---

## 2. What to add

One command:

```bash
cordova plugin add https://github.com/truid-ai/cordova-plugin-truid#sdk-v8.1.0-beta
```

Then build as usual:

```bash
cordova build android
```

The only host-side requirement is **`minSdk` 23 or higher**. If the project is below that,
the manifest merge fails; raise `cdvMinSdkVersion` in `config.xml`.

### Nothing else changes

Do **not** edit `compileSdk`, the Android Gradle Plugin, Gradle, `gradle.properties`,
dependency versions, or `AndroidManifest.xml`. The plugin already supplies:

- the JitPack repository and the truID SDK dependency
- all dependency versions listed above
- `android.useAndroidX=true` in the generated `gradle.properties`
- suppression of AGP's `checkAarMetadata`, which would otherwise reject Compose 1.1.1 and
  related artifacts at compileSdk 30
- Java 8 `compileOptions`
- `pickFirst` rules for `libc++_shared.so`, `libopencv_java4.so` and `libopencv_info.so`
- the `CAMERA`, `INTERNET`, `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` permissions
- the `TruIDLaunchActivity` manifest entry and its theme override

---

## 3. Calling it

```js
cordova.plugins.TruIDPlugin.launchSDK({
    apiKey:   '<your api key>',
    endPoint: 'https://<your backend>'
})
.then(function (result) {
    // result.sessionId
    // result.verificationStatus
    // result.statusCode
    // result.error
    // result.hasFingerprints
    // result.fingerprints
})
.catch(function (error) {
    // error is a string; "apiKey and endPoint are required" if either is missing
});
```

`apiKey` and `endPoint` are the only inputs. Which verification steps run is fixed inside
the plugin for this integration — it is not selectable from JavaScript. Ask truID if the
flow needs to change.

### Result

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | empty string when the SDK did not create a session |
| `verificationStatus` | boolean | overall outcome |
| `statusCode` | string | `"2017"` when the user cancelled |
| `error` | string | error text, empty when there is none |
| `hasFingerprints` | boolean | true when fingerprint data is present |
| `fingerprints` | array | one entry per captured finger, see below |

Each `fingerprints` entry:

| Field | Type | Notes |
|---|---|---|
| `fingerIndex` | number | ANSI/NIST index: 1 right thumb, 2–5 right index→pinky, 6 left thumb, 7–10 left index→pinky |
| `fingerName` | string | human-readable name for the index |
| `imageBase64` | string | PNG bytes, Base64, no `data:` prefix — for display |
| `wsqBase64` | string | WSQ template bytes, Base64 — for matching or upload |

Both payloads are inline Base64. A full eight-finger capture is roughly 730 KB in total, so
read them from the result rather than holding several copies in memory.

---

## 4. Known constraint

`checkAarMetadata` is disabled for the whole application module, not just for truID. It has
to be: Compose 1.1.1, lifecycle 2.4.0 and navigation 2.4.2 declare `minCompileSdk=31`
although none of them uses an API 31 resource. The side effect is that AGP no longer
verifies this metadata for the host's other dependencies either.
