# RigHand AI — Capacitor / Android Setup

Capacitor is configured in `frontend/capacitor.config.json`. Trip tracking uses:
- **Manual** — odometer start/end (all platforms)
- **GPS** — live miles via Geolocation (browser + Android)
- **OBD** — ELM327 BLE dongle (Android app only)

## 1. Install dependencies

```bash
cd frontend
npm install
```

Capacitor packages are already in `package.json`. To add the Android platform the first time:

```bash
npm run build
npx cap add android
npx cap sync
```

## 2. Build and sync

```bash
npm run build
npx cap sync
npx cap open android
```

Or use the shortcut:

```bash
npm run cap:sync
npm run cap:android
```

## 3. AndroidManifest.xml permissions

After `npx cap add android`, edit `android/app/src/main/AndroidManifest.xml` inside `<manifest>`:

```xml
<!-- GPS / Location -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

<!-- Bluetooth OBD-II -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

## 4. Play Store AAB

In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle (AAB)**.

Output: `android/app/release/app-release.aab`

## 5. Dev workflow

```bash
npm run build && npx cap sync
npx cap run android
```
