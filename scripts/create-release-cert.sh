#!/usr/bin/env bash
# Generate a self-signed code-signing certificate for CI release builds and
# print the values that need to be uploaded as GitHub Actions secrets.
#
# Run this once per fork. The PKCS#12 secret contains the private key, so pipe
# the output directly into `gh secret set`. Nothing is committed.

set -euo pipefail

CERT_NAME="Pipeup Release"
CERT_DIR=$(mktemp -d)
trap 'rm -rf "${CERT_DIR}"' EXIT

cat > "${CERT_DIR}/cert.conf" <<'CONF'
[req]
distinguished_name = dn
prompt = no
x509_extensions = v3_ext

[dn]
CN = Pipeup Release

[v3_ext]
basicConstraints = CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CONF

openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "${CERT_DIR}/key.pem" \
    -out "${CERT_DIR}/cert.pem" \
    -days 3650 \
    -config "${CERT_DIR}/cert.conf" 2>/dev/null

P12_PASSWORD="$(openssl rand -hex 24)"

P12_ARGS=(-export
          -inkey "${CERT_DIR}/key.pem"
          -in "${CERT_DIR}/cert.pem"
          -name "${CERT_NAME}"
          -out "${CERT_DIR}/cert.p12"
          -keypbe PBE-SHA1-3DES
          -certpbe PBE-SHA1-3DES
          -macalg sha1
          -passout "pass:${P12_PASSWORD}")
if openssl version | grep -qE "OpenSSL 3\."; then
    P12_ARGS+=(-legacy)
fi
openssl pkcs12 "${P12_ARGS[@]}" 2>/dev/null

P12_BASE64="$(base64 < "${CERT_DIR}/cert.p12")"

# Output in a parseable form: KEY=value, one per line. Caller pipes into gh.
cat <<EOF
MACOS_CERT_P12_BASE64=${P12_BASE64}
MACOS_CERT_P12_PASSWORD=${P12_PASSWORD}
EOF
