#!/usr/bin/env bash

set -euo pipefail

export TMPDIR=/tmp

readonly mode="${1:-build}"
readonly source_dir="/workspace"
readonly artifacts_dir="/artifacts"
readonly work_dir="$(mktemp -d /tmp/decisioneats-android.XXXXXX)"
emulator_pid=""

cleanup() {
  if [[ -n "$emulator_pid" ]]; then
    kill "$emulator_pid" 2>/dev/null || true
  fi
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

case "$mode" in
  build | emulator) ;;
  *)
    echo "Usage: $0 [build|emulator]" >&2
    exit 64
    ;;
esac

copy_project() {
  tar \
    --exclude='./.expo' \
    --exclude='./.git' \
    --exclude='./android' \
    --exclude='./build' \
    --exclude='./ios' \
    --exclude='./node_modules' \
    -C "$source_dir" \
    -cf - . | tar -C "$work_dir" -xf -
  ln -s "$source_dir/node_modules" "$work_dir/node_modules"
}

wait_for_emulator() {
  local boot_completed

  adb wait-for-device
  for _ in {1..180}; do
    boot_completed="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [[ "$boot_completed" == "1" ]]; then
      return
    fi

    if ! kill -0 "$emulator_pid" 2>/dev/null; then
      cat /tmp/decisioneats-emulator.log >&2
      exit 1
    fi

    sleep 1
  done

  echo "Android emulator did not boot within three minutes." >&2
  exit 1
}

copy_project
cd "$work_dir"

npm test
npm run typecheck
./node_modules/.bin/expo prebuild --platform android --no-install
./android/gradlew --no-daemon assembleDebug

readonly apk_path="$work_dir/android/app/build/outputs/apk/debug/app-debug.apk"
test -f "$apk_path"

if [[ -d "$artifacts_dir" ]]; then
  cp "$apk_path" "$artifacts_dir/decisioneats-debug.apk"
fi

if [[ "$mode" == "build" ]]; then
  echo "Android debug APK compiled successfully."
  exit 0
fi

if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
  echo "/dev/kvm is not accessible inside this container -- the emulator needs" >&2
  echo "hardware acceleration and would otherwise hang until the boot timeout." >&2
  echo "Pass it through with 'docker compose run --device /dev/kvm', confirm" >&2
  echo "nested virtualization is enabled on the host, and that the container" >&2
  echo "user can read/write the device." >&2
  exit 1
fi

emulator \
  -avd "$ANDROID_AVD_NAME" \
  -gpu swiftshader_indirect \
  -no-audio \
  -no-boot-anim \
  -no-snapshot \
  -no-window \
  -wipe-data > /tmp/decisioneats-emulator.log 2>&1 &
emulator_pid="$!"

wait_for_emulator

readonly application_id="$(aapt dump badging "$apk_path" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")"
if [[ -z "$application_id" ]]; then
  echo "Could not determine the Android application ID from the debug APK." >&2
  exit 1
fi

adb install -r "$apk_path"
adb shell monkey -p "$application_id" -c android.intent.category.LAUNCHER 1
sleep 2

readonly process_id="$(adb shell pidof "$application_id" | tr -d '\r')"
if [[ -z "$process_id" ]]; then
  echo "The Android app did not remain running after launch." >&2
  adb logcat -d -t 200 >&2
  exit 1
fi

if [[ -d "$artifacts_dir" ]]; then
  adb exec-out screencap -p > "$artifacts_dir/decisioneats-emulator.png"
fi

echo "Android emulator smoke test passed for $application_id (PID $process_id)."
