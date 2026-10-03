// The /install shell script. Kept out of the route file (routes may only export handlers).
export function script(origin: string): string {
  // The origin is pasted into shell code: accept only a bare http(s) origin.
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin))
    throw new Error("install script: unexpected origin");
  const o = origin;
  return `#!/bin/sh
# Glass Box one-line setup: connects this project's Claude Code to ${o}
set -eu
URL='${o}'
KEY="\${1:-\${GLASSBOX_AGENT_KEY:-}}"

if ! command -v node >/dev/null 2>&1; then
  echo "Glass Box needs Node.js 18 or newer: https://nodejs.org" >&2
  exit 1
fi

if [ -z "$KEY" ]; then
  echo "Glass Box: paste your agent key (make one at $URL/connect)."
  if [ ! -r /dev/tty ]; then
    echo "No terminal to read the key from. Run: curl -fsSL $URL/install | sh -s -- gb_YOUR_KEY" >&2
    exit 1
  fi
  printf "Agent key: "
  stty -echo </dev/tty 2>/dev/null || true
  IFS= read -r KEY </dev/tty || true
  stty echo </dev/tty 2>/dev/null || true
  echo
fi

case "$KEY" in
  gb_*) ;;
  *) echo "That doesn't look like a Glass Box key (they start with gb_). Make one at $URL/connect" >&2; exit 1 ;;
esac

TMP="$(mktemp -d "\${TMPDIR:-/tmp}/glassbox-install.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM
curl -fsSL "$URL/api/agent-kit/install.mjs" -o "$TMP/install.mjs"
node "$TMP/install.mjs" . --key "$KEY" --url "$URL"
echo
echo "Done. Restart Claude Code in this folder (approve \\"glassbox\\" if asked), then run /mcp to check it's connected."
`;
}
