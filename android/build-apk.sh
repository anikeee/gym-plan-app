#!/bin/zsh
# Builds and signs the Android app with the Android SDK build tools only: no Gradle, no downloads.
# Usage: android/build-apk.sh [versionCode] [versionName]     e.g. android/build-apk.sh 2 1.1.0
# The signing key lives OUTSIDE the repo. Every update must be signed with the same key,
# or phones refuse to install it over the old version.
set -euo pipefail
cd "$(dirname "$0")"

VERSION_CODE="${1:-1}"
VERSION_NAME="${2:-1.0.0}"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
KEY_DIR="${KEY_DIR:-$HOME/.android-keys/gym-plan-app}"
KEYSTORE="$KEY_DIR/release.jks"
PASSFILE="$KEY_DIR/password.txt"
OUT=build

[[ -f "$KEYSTORE" && -f "$PASSFILE" ]] || { echo "Signing key not found in $KEY_DIR" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

# 1. Resources and manifest. minSdk 24 = Android 7. targetSdk 34: see the note in AndroidManifest.xml.
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" --manifest AndroidManifest.xml --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  "$OUT/res.zip"

# 2. Java to dex.
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java') 2>&1 | grep -v -E 'obsolete|warning: \[options\]|To suppress warnings' || true
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)

# 3. Align, sign, verify.
"$BT/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
# PKCS12 keys share the keystore password, so --key-pass is left out (apksigner reads one line per flag from a shared file).
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "file:$PASSFILE" \
  --out "$OUT/workout-plan.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/workout-plan.apk"
rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/res.zip"
echo "Built $(pwd)/$OUT/workout-plan.apk (version $VERSION_NAME, code $VERSION_CODE)"
