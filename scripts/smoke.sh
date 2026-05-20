#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080}"

echo "Checking ${API_BASE}/healthz"
curl -fsS "${API_BASE}/healthz" >/dev/null

echo "Checking ${API_BASE}/readyz"
curl -fsS "${API_BASE}/readyz" >/dev/null

echo "Checking public monthly report"
curl -fsS "${API_BASE}/reports/monthly" >/dev/null

echo "Checking public pool aggregate"
curl -fsS "${API_BASE}/pool/this-week" >/dev/null

echo "Smoke checks passed."
