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

# ── Password reset ────────────────────────────────────────────────────────────
echo ""
echo "── Password reset ──"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/password/reset/request" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d "{\"email\":\"$EMAIL\"}")
check "POST /auth/password/reset/request → ok" "ok" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/auth/password/reset/confirm" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"token":"invalid","newPassword":"newpass123"}')
check "POST /auth/password/reset/confirm bad token → reset_token_invalid" "reset_token_invalid" "$R"

# ── Public ────────────────────────────────────────────────────────────────────
echo ""
echo "── Public ──"

R=$(curl -s "$API/reports/monthly")
check "GET /reports/monthly → totalRaisedKobo" "totalRaisedKobo" "$R"

R=$(curl -s "$API/pool/this-week")
check "GET /pool/this-week → depositCount" "depositCount" "$R"

# ── Protected GETs ────────────────────────────────────────────────────────────
echo ""
echo "── Protected GETs ──"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/notifications")
check "GET /notifications → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/wallet")
check "GET /wallet → balanceKobo" "balanceKobo" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/wallet/transactions")
check "GET /wallet/transactions → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/recipients/me")
check "GET /recipients/me → not_found or status" "not_found\|status" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/roster/me")
check "GET /roster/me → not_found or verified" "not_found\|verified" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/driver/me")
check "GET /driver/me → not_found or status" "not_found\|status" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/driver/impact")
check "GET /driver/impact → not_found or impact" "not_found\|impact\|trips" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/driver/average")
check "GET /driver/average → not_found or average" "not_found\|average\|score" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/attendance/me")
check "GET /attendance/me → array or object" "\[\|week\|attendance" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/trips")
check "GET /trips → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/trips/demand")
check "GET /trips/demand → object" ".\+" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/hubs")
check "GET /hubs → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/notes")
check "GET /notes → items" "items" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/ride/bookings")
check "GET /ride/bookings → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/drive/trips")
check "GET /drive/trips → array" "\[" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/banks")
check "GET /banks → array or not_configured" "\[\|not_configured\|payments" "$R"

# ── Write paths ───────────────────────────────────────────────────────────────
echo ""
echo "── Write paths ──"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/notes" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"body":"Keep going, you are doing great!"}')
check "POST /notes → id" "id" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/recipients/apply" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"weeklyCost":5000,"disbursementMethod":"wallet","reason":"I need transport support"}')
check "POST /recipients/apply unverified → email_not_verified" "email_not_verified" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/driver/apply" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"vehicleType":"car","plateNumber":"ABC-123DE","seats":4}')
check "POST /driver/apply → id or already_applied" "id\|already" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/trips" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"hubName":"Iyana-Ipaja","destination":"Unilag","departureAt":"2026-12-01T08:00:00Z","seats":4,"priceKobo":50000}')
check "POST /trips unapproved driver → driver_not_approved" "driver_not_approved" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/wallet/debit" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"amountKobo":100000,"description":"test debit"}')
check "POST /wallet/debit insufficient → insufficient_balance\|not_found" "insufficient_balance\|not_found" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/wallet/withdraw" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"amountKobo":100000}')
check "POST /wallet/withdraw no recipient → not_found\|not_approved\|no_bank" "not_found\|not_approved\|no_bank" "$R"

# ── Notification actions ───────────────────────────────────────────────────────
echo ""
echo "── Notifications ──"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/notifications/read-all" \
  -H "X-CSRF-Token: $(csrf)")
check "POST /notifications/read-all → ok" "ok" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/notifications/nonexistent-id/read" \
  -H "X-CSRF-Token: $(csrf)")
check "POST /notifications/:id/read bad id → not_found\|error" "not_found\|error" "$R"

# ── Trip actions on nonexistent trip ─────────────────────────────────────────
echo ""
echo "── Trip actions ──"

FAKE_ID="00000000-0000-0000-0000-000000000000"

R=$(curl -c "$JAR" -b "$JAR" -s "$API/trips/$FAKE_ID")
check "GET /trips/:id not found → trip_not_found" "trip_not_found" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/trips/$FAKE_ID/bookings" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"seats":1}')
check "POST /trips/:id/bookings not found → trip_not_found" "trip_not_found" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/trips/$FAKE_ID/ratings" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"score":5}')
check "POST /trips/:id/ratings not found → error" "not_found\|not_allowed\|invalid_subject" "$R"

R=$(curl -c "$JAR" -b "$JAR" -s -X POST "$API/trips/$FAKE_ID/sos" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(csrf)" \
  -d '{"message":"help"}')
check "POST /trips/:id/sos not found → trip_not_found\|not_found" "trip_not_found\|not_found" "$R"

# ── 401 guards ────────────────────────────────────────────────────────────────
echo ""
echo "── 401 guards ──"

for path in /notifications /wallet /wallet/transactions /recipients/me /roster/me /driver/me /trips /hubs /notes /ride/bookings /drive/trips /banks; do
  R=$(curl -s "$API$path")
  check "GET $path no cookie → not_authenticated" "not_authenticated" "$R"
done

# ── Steward gate ──────────────────────────────────────────────────────────────
echo ""
echo "── Steward gate ──"

for path in /steward/queue /steward/audit /steward/payouts /steward/sos /steward/appeals; do
  R=$(curl -c "$JAR" -b "$JAR" -s "$API$path")
  check "GET $path as member → steward_required" "steward_required" "$R"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────"
echo "  Passed: $PASS  Failed: $FAIL"
echo "────────────────────────────────"

rm -f "$JAR"
[ "$FAIL" -eq 0 ]
