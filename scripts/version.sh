#!/usr/bin/env bash
# sets version environment variable for goreleaser to use
# scripts/version.sh goreleaser ...

if [[ -z "${JFA_GO_SNAPSHOT}" ]]; then
    export JFA_GO_SOURCEMAP=""
    export JFA_GO_COPYTS="echo skipping sourcemaps"
    export JFA_GO_STRIP=""
    export JFA_GO_MINIFY="--minify"
else
    echo "SNAPSHOT"
    export JFA_GO_SOURCEMAP="--sourcemap"
    export JFA_GO_COPYTS="cp -r tempts data/web/js/ts"
    export JFA_GO_STRIP="-s -w"
    export JFA_GO_MINIFY=""
fi

if [[ -z "${INTERNAL}" ]]; then
    export INTERNAL=on
fi
if [[ "${INTERNAL}" == "on" ]]; then
    export JFA_GO_TAG=""
else
    export JFA_GO_TAG="external"
fi

if [[ -z "${UPDATER}" ]]; then
    export UPDATER=on
    export JFA_GO_UPDATER=binary
else
    export JFA_GO_UPDATER=$UPDATER
fi

JFA_GO_VERSION=$(git describe --exact-match HEAD 2> /dev/null || echo 'vgit')
TIMEOUT=60m

JFA_GO_CSS_VERSION="v3" JFA_GO_NFPM_EPOCH=$(git rev-list --all --count) JFA_GO_BUILD_TIME=$(date +%s) JFA_GO_BUILT_BY=${JFA_GO_BUILT_BY:-"???"} JFA_GO_VERSION="$(echo $JFA_GO_VERSION | sed 's/v//g')" $@ --timeout $TIMEOUT
