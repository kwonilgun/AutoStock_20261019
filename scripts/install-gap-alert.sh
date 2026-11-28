#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
TSX="$ROOT/node_modules/tsx/dist/cli.mjs"
if [[ ! -x "$NODE" && ! -f "$NODE" ]]; then
  echo "node를 찾지 못했습니다." >&2
  exit 1
fi
if [[ ! -f "$TSX" ]]; then
  echo "tsx가 없습니다. 프로젝트에서 npm install을 먼저 실행하세요." >&2
  exit 1
fi

PLIST="$HOME/Library/LaunchAgents/com.eggbalance.gap-alert.plist"
LOG="$HOME/Library/Logs/eggbalance-gap-alert.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
NODE_DIR="$(cd "$(dirname "$NODE")" && pwd)"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.eggbalance.gap-alert</string>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${TSX}</string>
    <string>scripts/gap-alert.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${NODE_DIR}:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>8</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <dict>
      <key>Hour</key>
      <integer>14</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
  </array>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/com.eggbalance.gap-alert" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
launchctl enable "gui/${UID_NUM}/com.eggbalance.gap-alert"
echo "예약했습니다. 이 맥의 오전 8시와 오후 2시에 실행됩니다. 기록은 ${LOG}"
