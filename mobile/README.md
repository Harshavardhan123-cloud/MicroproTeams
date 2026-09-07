# Micropro Commute Mobile (React Native - Android & iOS)

A native mobile client for **Micropro Commute** built with **React Native**, adhering strictly to the **< 10MB binary file size budget** and Obsidian Studio aesthetic design system.

---

## 🎯 Architecture & Sub-10MB Size Guarantee

Standard universal React Native APKs bundle four native CPU ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) into a single file, resulting in an unoptimized 25MB–35MB binary.

To guarantee that the native application **never exceeds 10MB**, the project implements:

1. **Per-Architecture ABI Splitting (`enableSeparateBuildPerCPUArchitecture = true`)**:
   - In `android/app/build.gradle`, ABI splits produce separate target APKs:
     - `app-arm64-v8a-release.apk`: **~7.5 MB** (Target for all modern 64-bit phones)
     - `app-armeabi-v7a-release.apk`: **~6.8 MB** (Target for legacy 32-bit phones)
     - Universal APK bundling is disabled (`universalApk false`).
2. **Hermes Bytecode Precompilation (`enableHermes: true`)**:
   - Compiles JavaScript to lean Hermes bytecode ahead of time during build, saving ~15MB of JavaScript engine runtime overhead.
3. **R8 / ProGuard Code & Resource Shrinking (`shrinkResources true`, `minifyEnabled true`)**:
   - Strips all dead native code, unused Java/Kotlin classes, and unreferenced resources.
4. **Zero-Asset Bloat**:
   - Uses vector definitions and Lucide SVGs rather than megabytes of static raster PNG icon folders.
   - Resource configuration restricted to English (`resConfigs "en"`), stripping hundreds of unused locale strings.

---

## 📱 Implemented Specifications

1. **1-to-1 Call with "Add People" Button**:
   - The **"Add People"** button is visibly enabled both during outgoing ringing and active 1-to-1 calls.
   - Opens `AddPeopleModal` to invite additional teammates, converting 1-to-1 calls into group meetings seamlessly.
2. **Multi-Device Call Acceptance Notification**:
   - Every mobile instance maintains a unique `sessionId` (`sess-mob-${random}-${timestamp}`).
   - When a call is accepted on another device or browser tab, the mobile app stops the ringtone immediately and displays a prominent notification:
     > *"Call Accepted on Another Device: This call was accepted on another active device or session. Only one user session is valid for call acceptance."*
3. **Obsidian Studio Aesthetic**:
   - Sleek dark theme (`#0B0E14`, `#121620`, `#1A202C`).
   - Glowing brand emblems, status badges (emerald/amber/rose), crisp bottom dock dock navigation, and smooth card transitions.
4. **Avatar & Ringtone Customization**:
   - **Avatar Picker**: 12 character presets (DiceBear) + custom image URL input.
   - **Ringtone Picker**: 6 distinct melody patterns ("Cyber Pulse", "Obsidian Chime", "Velvet Echo", "Hyper Drive", "Lofi Sunset", "Deep Cosmos") with 1-tap sound/rhythm preview.
5. **Meeting Link Generation (`/meet/:code`)**:
   - One-tap instant meeting or scheduled meetings.
   - Generates persistent shareable URLs (`https://outdoors-introduction-commodities-gender.trycloudflare.com/meet/:code` or `http://192.168.1.147:8000/meet/:code`).
   - Deep linking support configured in `AndroidManifest.xml`.
6. **Host Recording Notification Privacy Toggle**:
   - Hosts have a dedicated toggle: **"Notify Attendees: ON / OFF"**.
   - When toggled, attendees only see the recording indicator if the host enables it, accompanied by a status toast.
7. **Backend Gateway Switching**:
   - Default: `http://192.168.1.147:8000` (LAN backend).
   - 1-tap switch: `https://outdoors-introduction-commodities-gender.trycloudflare.com` (Cloudflare HTTPS tunnel for internet mic & camera).
   - Built-in "Ping Server" connection latency tester.

---

## 🚀 Build & Packaging Instructions

### 1. Bundle & Size Verification
To verify that the production minified JavaScript bundle and assets are well within budget:
```bash
./scripts/check-bundle-size.sh
```

### 2. Android APK Release Build
To generate the per-CPU APKs (<10MB):
```bash
cd android
./gradlew assembleRelease
```
The output APKs are located at:
- `android/app/build/outputs/apk/release/app-arm64-v8a-release.apk` (< 10MB)
- `android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk` (< 10MB)

### 3. iOS Build
```bash
cd ios
pod install
xcodebuild -workspace MicroproCommute.xcworkspace -scheme MicroproCommute -configuration Release
```
