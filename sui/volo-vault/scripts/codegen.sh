#!/usr/bin/env bash
#
# Run a `sentio` command against a Sui RPC endpoint that still serves JSON-RPC.
#
#   ./scripts/codegen.sh                 # gen (the default)
#   ./scripts/codegen.sh upload          # build + upload; codegen runs first
#   SUI_RPC=https://some-other-endpoint ./scripts/codegen.sh
#
# Why this exists. @sentio/cli 2.26.3 does codegen through JSON-RPC
# (`sui_getNormalizedMoveModulesByPackage`, then `sui_getChainIdentifier`), and the
# public fullnode it defaults to now answers both with:
#
#   Method not found. JSON-RPC on public fullnodes has been deprecated.
#
# So `npx sentio gen` cannot complete on this CLI version, whatever the ABIs say.
# The endpoint is not configurable: `sentio gen` takes no flag for it, and unlike
# the runtime path the codegen path never consults `Endpoints.INSTANCE.chainServer`
# — SuiNetworkCodegen calls getRpcEndpoint(network) directly, which returns a
# hardcoded URL. Hence patching the SDK for the duration of one command.
#
# The patch touches node_modules only, is reverted on exit even if gen fails, and
# is verified gone before this script returns non-zero. The generated types under
# src/types/sui are the committed artifact; nothing here needs to survive.
#
# The real fix is upgrading @sentio/cli and @sentio/sdk to a version that speaks
# gRPC or GraphQL, which regenerates every type in this processor and wants its
# own review.

set -euo pipefail

CMD="${1:-gen}"
RPC="${SUI_RPC:-https://rpc-mainnet.suiscan.xyz}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK_JS="$(cd "$HERE/../.." && pwd)/node_modules/@sentio/sdk/lib/sui/network.js"

if [ ! -f "$NETWORK_JS" ]; then
  echo "cannot find $NETWORK_JS — run from the processor directory with deps installed" >&2
  exit 1
fi

BACKUP="$(mktemp)"
cp "$NETWORK_JS" "$BACKUP"

restore() {
  cp "$BACKUP" "$NETWORK_JS"
  rm -f "$BACKUP"
  if grep -q 'rpc-mainnet.suiscan.xyz\|SUI_RPC' "$NETWORK_JS"; then
    echo "PATCH NOT REVERTED — restore $NETWORK_JS by hand or reinstall deps" >&2
    exit 1
  fi
  echo "sdk endpoint restored"
}
trap restore EXIT

echo "sentio $CMD via $RPC"
sed -i '' "s|https://fullnode.mainnet.sui.io/|$RPC|" "$NETWORK_JS"
grep -q "$RPC" "$NETWORK_JS" || { echo "patch did not apply" >&2; exit 1; }

cd "$HERE"
npx sentio "$CMD"
