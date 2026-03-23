#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_PATH="$ROOT_DIR/apps/native-macos/LoopBrowserNative.xcodeproj"
DERIVED_DATA_PATH="$ROOT_DIR/output/native/TestDerivedDataStress"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RESULT_BUNDLE_PATH="$ROOT_DIR/output/native/TestResultsStress-$TIMESTAMP.xcresult"
TARGET_TEST="${TARGET_TEST:-LoopBrowserNativeUITests/LoopBrowserNativeUITests/testCompositeCanvasWorkflowRemainsInteractive}"

mkdir -p "$ROOT_DIR/output/native"

HOME=/tmp xcodebuild test \
  -project "$PROJECT_PATH" \
  -scheme LoopBrowserNative \
  -destination "platform=macOS,arch=arm64" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -resultBundlePath "$RESULT_BUNDLE_PATH" \
  -only-testing:"$TARGET_TEST"

echo "RESULT_BUNDLE_PATH=$RESULT_BUNDLE_PATH"
