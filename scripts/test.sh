#!/usr/bin/env bash
set -uo pipefail

API="${API_BASE:-http://localhost:8080}"
JAR="/tmp/akin_test.jar"
PASS=0
FAIL=0

green() { echo -e "\033[32m✓ $*\033[0m"; }
red()   { echo -e "\033[31m✗ $*\033[0m"; }

check() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    green "$label"
    ((PASS++))
  else
    red "$label — got: $actual"
    ((FAIL++))
  fi
}

rm -f "$JAR"

csrf() { grep akin_csrf "$JAR" 2>/dev/null | awk '{print $7}' | tail -1 || true; }

# ── Health ────────────────────────────────────────────────────────────────────
echo ""
echo "── Health ──"

R=$(curl -c "$JAR" -b "$JAR" -s -o /dev/null -w "%{http_code}" "$API/healthz")
check "GET /healthz → 200" "200" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -o /dev/null -w "%{http_code}" "$API/readyz")
check "GET /readyz → 200" "200" "$R"

# ── CSRF ──────────────────────────────────────────────────────────────────────
echo ""
echo "── CSRF ──"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/auth/csrf")
check "GET /auth/csrf → ok" "ok" "$R"

R=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"x@x.com","password":"x"}')
check "POST without CSRF → csrf_missing" "csrf_missing" "$R"

# ── Auth ──────────────────────────────────────────────────────────────────────
echo ""
echo "── Auth ──"

EMAIL="smoketest_$(date +%s)@example.com"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/signup" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d "{\"email\":\"$EMAIL\",\"firstName\":\"Smoke\",\"lastName\":\"Test\",\"phone\":\"08012345678\",\"password\":\"password123\"}")
check "POST /auth/signup → id" "id" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}")
check "POST /auth/login → id" "id" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/auth/me")
check "GET /auth/me → email" "$EMAIL" "$R"

R=$(curl -s "$API/auth/me")
check "GET /auth/me no cookie → not_authenticated" "not_authenticated" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/logout" \
  -H "X-CSRF-Token: $(csrf)")
check "POST /auth/logout → ok" "ok" "$R"

R=$(curl -b "$JAR" -s "$API/auth/me")
check "GET /auth/me after logout → unauthenticated" "not_authenticated\|session_invalid" "$R"

# Re-login for remaining tests
curl -c "$JAR" -b "$JAR" -s "$API/auth/csrf" > /dev/null
R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}")
check "POST /auth/login (re-login) → id" "id" "$R"

# ── Public ────────────────────────────────────────────────────────────────────
echo ""
echo "── Public ──"

R=$(curl -s "$API/reports/monthly")
check "GET /reports/monthly → totalRaisedKobo" "totalRaisedKobo" "$R"

R=$(curl -s "$API/pool/this-week")
check "GET /pool/this-week → depositCount" "depositCount" "$R"

# ── Protected (auth required) ─────────────────────────────────────────────────
echo ""
echo "── Protected ──"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/notifications")
check "GET /notifications → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/wallet")
check "GET /wallet → balanceKobo" "balanceKobo" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/recipients/me")
check "GET /recipients/me → 404 or recipient" "not_found\|recipient\|status" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/roster/me")
check "GET /roster/me → 404 or verified" "not_found\|verified\|studentId" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/driver/me")
check "GET /driver/me → 404 or driver" "not_found\|driver\|status" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/attendance/me")
check "GET /attendance/me → array or empty" "\[\|attendance" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/trips")
check "GET /trips → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/hubs")
check "GET /hubs → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/notes")
check "GET /notes → array" "\[" "$R"

# ── Auth-required returns 401 without cookie ──────────────────────────────────
echo ""
echo "── 401 guards ──"

for path in /notifications /wallet /recipients/me /roster/me /driver/me /trips /hubs /notes; do
  R=$(curl -s "$API$path")
  check "GET $path no cookie → not_authenticated" "not_authenticated" "$R"
done

# ── Steward role gate ─────────────────────────────────────────────────────────
echo ""
echo "── Steward gate ──"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/steward/queue")
check "GET /steward/queue as member → steward_required" "steward_required" "$R"

# ── Password reset ────────────────────────────────────────────────────────────
echo ""
echo "── Password reset ──"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/password/reset/request" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d "{\"email\":\"$EMAIL\"}")
check "POST /auth/password/reset/request → ok" "ok" "$R"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────"
echo "  Passed: $PASS  Failed: $FAIL"
echo "────────────────────────────────"

rm -f "$JAR"
[ "$FAIL" -eq 0 ]
