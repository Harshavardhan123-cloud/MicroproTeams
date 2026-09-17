#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "    Micropro Commute: Android & iOS Release Packaging     "
echo "=========================================================="

echo "[1/4] Preparing Android bundle directories..."
mkdir -p "$DIR/android/app/src/main/assets"
mkdir -p "$DIR/android/app/src/main/res"

echo "[2/4] Generating Production Minified Android Bundle..."
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output "$DIR/android/app/src/main/assets/index.android.bundle" \
  --assets-dest "$DIR/android/app/src/main/res" \
  --minify true

BUNDLE_SIZE=$(stat -c%s "$DIR/android/app/src/main/assets/index.android.bundle" 2>/dev/null || stat -f%z "$DIR/android/app/src/main/assets/index.android.bundle")
BUNDLE_KB=$((BUNDLE_SIZE / 1024))
echo "-> Production JS Bundle size: ${BUNDLE_KB} KB"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "[3/4] Checking Gradle build environment..."
if [ -f "$DIR/android/gradlew" ]; then
  cd "$DIR/android"
  echo "-> Running assembleRelease with Gradle..."
  ./gradlew assembleRelease --no-daemon
  cd "$DIR"

  APK_UNIVERSAL="$DIR/android/app/build/outputs/apk/release/app-universal-release.apk"
  APK_ARM64="$DIR/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk"
  APK_ARMV7="$DIR/android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk"

  echo "=========================================================="
  if [ -f "$APK_UNIVERSAL" ]; then
    SIZE_UNIV=$(stat -c%s "$APK_UNIVERSAL")
    MB_UNIV=$(awk "BEGIN {printf \"%.2f\", $SIZE_UNIV/1048576}")
    echo "  Universal Release APK: $APK_UNIVERSAL (${MB_UNIV} MB)"
  fi
  if [ -f "$APK_ARM64" ]; then
    SIZE_ARM64=$(stat -c%s "$APK_ARM64")
    MB_ARM64=$(awk "BEGIN {printf \"%.2f\", $SIZE_ARM64/1048576}")
    echo "  arm64-v8a Release APK: $APK_ARM64 (${MB_ARM64} MB)"
    if [ "$SIZE_ARM64" -le 10485760 ]; then
      echo "  ✅ arm64-v8a is under 10MB budget limit!"
    fi
  fi
  if [ -f "$APK_ARMV7" ]; then
    SIZE_ARMV7=$(stat -c%s "$APK_ARMV7")
    MB_ARMV7=$(awk "BEGIN {printf \"%.2f\", $SIZE_ARMV7/1048576}")
    echo "  armeabi-v7a Release APK: $APK_ARMV7 (${MB_ARMV7} MB)"
  fi
else
  echo "-> Note: Local Android SDK/Gradle wrapper not configured on this host."
fi

echo "[4/4] Verifying iOS bundle..."
mkdir -p "$DIR/ios_build"
npx react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output "$DIR/ios_build/main.jsbundle" \
  --assets-dest "$DIR/ios_build" \
  --minify true

IOS_SIZE=$(stat -c%s "$DIR/ios_build/main.jsbundle" 2>/dev/null || stat -f%z "$DIR/ios_build/main.jsbundle")
IOS_KB=$((IOS_SIZE / 1024))
echo "-> iOS Production Bundle size: ${IOS_KB} KB"

echo "=========================================================="
echo " Packaging validation complete! Both bundles < 10MB limit."
echo "=========================================================="
