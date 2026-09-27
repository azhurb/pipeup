#!/usr/bin/env bash
# Build a DMG signed with a stable, machine-local self-signed certificate.
#
# Why: ad-hoc-signed builds get a fresh code-signing identity on every rebuild,
# which makes macOS treat each build as a different app and forget Accessibility
# / Input Monitoring grants. A stable self-signed cert keeps the identity (and
# therefore the TCC permissions) constant across rebuilds on this machine.
#
# The certificate is created in the user's login keychain on first run and
# never leaves the machine — it is not committed and not shared.

set -euo pipefail

CERT_NAME="Pipeup Local"
KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"

cd "$(dirname "$0")/.."

# Ensure cargo is on PATH (rustup default install location).
if [[ -d "${HOME}/.cargo/bin" ]]; then
    export PATH="${HOME}/.cargo/bin:${PATH}"
fi

# Look up the SHA-1 hash of an existing identity with our label, if any.
# Using the hash for signing avoids ambiguity when the keychain holds duplicates.
get_cert_hash() {
    security find-identity "${KEYCHAIN}" \
        | awk -v name="\"${CERT_NAME}\"" '$0 ~ name { print $2; exit }'
}

CERT_HASH="$(get_cert_hash)"

if [[ -z "${CERT_HASH}" ]]; then
    echo "==> Creating self-signed code-signing certificate '${CERT_NAME}'"

    CERT_DIR=$(mktemp -d)
    trap 'rm -rf "${CERT_DIR}"' EXIT

    cat > "${CERT_DIR}/cert.conf" <<'CONF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ext

[dn]
CN = Pipeup Local

[v3_ext]
basicConstraints = CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CONF

    openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout "${CERT_DIR}/key.pem" \
        -out "${CERT_DIR}/cert.pem" \
        -days 3650 \
        -config "${CERT_DIR}/cert.conf"

    # macOS Security framework only reads PKCS#12 with legacy ciphers + SHA1 MAC.
    P12_PASS="$(openssl rand -hex 24)"
    P12_ARGS=(-export
              -inkey "${CERT_DIR}/key.pem"
              -in "${CERT_DIR}/cert.pem"
              -name "${CERT_NAME}"
              -out "${CERT_DIR}/cert.p12"
              -keypbe PBE-SHA1-3DES
              -certpbe PBE-SHA1-3DES
              -macalg sha1
              -passout "pass:${P12_PASS}")
    if openssl version | grep -qE "OpenSSL 3\."; then
        P12_ARGS+=(-legacy)
    fi
    openssl pkcs12 "${P12_ARGS[@]}"

    security import "${CERT_DIR}/cert.p12" \
        -k "${KEYCHAIN}" \
        -P "${P12_PASS}" \
        -T /usr/bin/codesign \
        -A

    CERT_HASH="$(get_cert_hash)"
    if [[ -z "${CERT_HASH}" ]]; then
        echo "Error: certificate import appeared to succeed but identity not found." >&2
        exit 1
    fi
    echo "    Certificate installed (hash: ${CERT_HASH})."
fi

export APPLE_SIGNING_IDENTITY="${CERT_HASH}"
echo "==> Building DMG (signing identity: ${CERT_NAME} / ${CERT_HASH})"
npm run tauri build -- --bundles dmg
