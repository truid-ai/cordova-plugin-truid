# cordova-plugin-truid

Cordova plugin integrating the native **TruID identity-verification SDK** — document capture, face liveness, ID-to-selfie matching, and fingerprint capture — into Ionic/Cordova applications, on **Android** and **iOS**.

Verified end-to-end on physical devices with an Ionic 4 (Angular 8) / Cordova 10 host app.

## Quick start

```bash
cordova plugin add https://github.com/TZK7/cordova-plugin-truid.git
```

```js
const result = await cordova.plugins.TruIDPlugin.launchSDK({
  apiKey: '<TruID API key>',      // fetch from your backend in production
  endPoint: 'https://staging-api.truid.ai',
  applicationId: 12345
});
console.log(result.sessionId);    // -> verify server-side with TruID
```

**→ Full setup, required config.xml preferences, the iOS Swift-Package step, Angular usage examples, and troubleshooting: [INTEGRATION.md](INTEGRATION.md)**

## What's inside

| Path | Purpose |
|---|---|
| `www/TruIDPlugin.js` | JS bridge (`cordova.plugins.TruIDPlugin`, promise-based) |
| `src/android/` | Java implementation + Gradle dependency (`com.github.truid-ai:android-sdk:8.0.1`, public JitPack) |
| `src/ios/` | Swift implementation (SDK via Swift Packages — see INTEGRATION.md) |
| `hooks/` | Build hook making cordova-android 10 projects AGP-8 compatible (automatic) |
| `examples/` | Typed TypeScript facade + a complete Ionic verification page |

## Requirements (summary)

- Cordova 10, cordova-android 10.x, cordova-ios 6.2+
- **JDK 17+** for Android builds (AGP 8)
- iOS 13+ deployment target; SDK packages added once in Xcode (SPM)

## License

MIT
