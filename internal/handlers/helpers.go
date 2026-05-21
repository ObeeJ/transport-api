package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/obeej/akin/internal/config"
	"github.com/obeej/akin/internal/service"
)

func setSessionCookie(c *fiber.Ctx, cfg *config.Config, token string, expires time.Time) {
	prod := cfg.AppEnv == "production"
	sameSite := "Lax"
	if prod {
		sameSite = "None"
	}
	c.Cookie(&fiber.Cookie{
		Name:     cfg.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HTTPOnly: true,
		SameSite: sameSite,
		Secure:   prod,
	})
}

func hashTokenForCookie(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// httpErr maps a service sentinel error to an HTTP status + error code.
// Handlers call this instead of repeating switch blocks.
// Returns (0, "") when the error is not a known sentinel — caller falls
// through to its own default.
func httpErr(err error) (status int, code string) {
	type entry struct {
		sentinel error
		status   int
		code     string
	}
	table := []entry{
		// auth
		{service.ErrEmailInvalid, 400, "email_invalid"},
		{service.ErrPasswordTooShort, 400, "password_too_short"},
		{service.ErrPhoneInvalid, 400, "phone_invalid"},
		{service.ErrEmailTaken, 409, "email_taken"},
		{service.ErrInvalidCreds, 401, "invalid_credentials"},
		// deposit
		{service.ErrAmountTooSmall, 400, "amount_too_small"},
		{service.ErrInvalidFrequency, 400, "invalid_frequency"},
		{service.ErrDepositNotFound, 404, "deposit_not_found"},
		{service.ErrPaymentsNotConfigured, 503, "payments_not_configured"},
		// recipient
		{service.ErrWeeklyCostTooSmall, 400, "weekly_cost_too_small"},
		{service.ErrInvalidDisbursementMethod, 400, "invalid_disbursement_method"},
		{service.ErrPseudonymFailed, 500, "pseudonym_failed"},
		{service.ErrRecipientNotFound, 404, "recipient_not_found"},
		{service.ErrRecipientNotApproved, 409, "not_approved"},
		{service.ErrNoBankOnFile, 412, "no_bank_on_file"},
		{service.ErrStewardCannotReceive, 403, "steward_cannot_receive"},
		// steward
		{service.ErrNotFound, 404, "not_found"},
		{service.ErrAlreadyDecided, 409, "already_decided"},
		{service.ErrSelfReview, 403, "self_review_forbidden"},
		{service.ErrAlreadyRecorded, 409, "already_recorded"},
		{service.ErrInvalidDecision, 400, "invalid_decision"},
		{service.ErrWeeklyCapTooSmall, 400, "weekly_cap_too_small"},
		// payout
		{service.ErrPayoutNotFound, 404, "payout_not_found"},
		{service.ErrAlreadyProcessed, 409, "already_processed"},
		{service.ErrSameSteward, 409, "same_steward"},
		{service.ErrSelfPayout, 403, "self_payout_forbidden"},
		{service.ErrExceedsWeeklyCap, 400, "exceeds_weekly_cap"},
		{service.ErrAmountTooSmallPayout, 400, "amount_too_small"},
		// attendance gate
		{service.ErrAttendanceMissing, 412, "attendance_missing"},
		{service.ErrAttendanceCSVInvalid, 400, "attendance_csv_invalid"},
		// wallet
		{service.ErrInsufficientBalance, 422, "insufficient_balance"},
		{service.ErrWalletNotFound, 404, "wallet_not_found"},
		// ride
		{service.ErrHubNotFound, 404, "hub_not_found"},
		{service.ErrTripNotFound, 404, "trip_not_found"},
		{service.ErrNotYourTrip, 403, "not_your_trip"},
		{service.ErrInvalidTripState, 409, "invalid_state"},
		{service.ErrCannotCancel, 409, "cannot_cancel"},
		{service.ErrTripFull, 409, "trip_full"},
		{service.ErrAlreadyBooked, 409, "already_booked"},
		{service.ErrNotBookable, 409, "not_bookable"},
		{service.ErrCannotBookOwn, 403, "cannot_book_own_trip"},
		{service.ErrBookingNotFound, 404, "no_booking"},
		{service.ErrInvalidSeats, 400, "invalid_seats"},
		{service.ErrDestinationEmpty, 400, "destination_required"},
		{service.ErrDepartureInPast, 400, "departure_in_past"},
		// driver
		{service.ErrDriverNotFound, 404, "driver_not_found"},
		{service.ErrDriverNotApproved, 409, "driver_not_approved"},
		{service.ErrInvalidVehicleType, 400, "invalid_vehicle_type"},
		{service.ErrInvalidAttendanceStatus, 400, "invalid_attendance_status"},
		// roster
		{service.ErrStudentIDAlreadyUsed, 409, "student_id_already_used"},
		{service.ErrStudentIDNotVerified, 403, "student_id_not_verified"},
		// email verify
		{service.ErrInvalidVerifyToken, 400, "invalid_verify_token"},
		{service.ErrAlreadyVerified, 409, "already_verified"},
		// password reset
		{service.ErrResetTokenInvalid, 400, "reset_token_invalid"},
		// ratings
		{service.ErrAlreadyRated, 409, "already_rated"},
		{service.ErrInvalidScore, 400, "invalid_score"},
		{service.ErrRatingNotAllowed, 403, "rating_not_allowed"},
		// SOS
		{service.ErrSOSNotFound, 404, "sos_not_found"},
		{service.ErrSOSNotOpen, 409, "sos_not_open"},
		{service.ErrSOSNotAcked, 409, "sos_not_acknowledged"},
		// GPS
		{service.ErrGPSNotAllowed, 403, "gps_not_allowed"},
		// notes
		{service.ErrNoteEmpty, 400, "note_empty"},
		{service.ErrNoteTooLong, 400, "note_too_long"},
		// appeals
		{service.ErrAppealNotFound, 404, "appeal_not_found"},
		{service.ErrAppealNotOpen, 409, "appeal_not_open"},
		{service.ErrAppealSameSteward, 403, "appeal_same_steward_forbidden"},
		{service.ErrTooManyAppeals, 429, "too_many_appeals"},
		{service.ErrInvalidOutcome, 400, "invalid_outcome"},
	}
	for _, e := range table {
		if errors.Is(err, e.sentinel) {
			return e.status, e.code
		}
	}
	return 0, ""
}

// fail writes the mapped error response. Falls back to 500 if not a known sentinel.
func fail(c *fiber.Ctx, err error, fallbackCode string) error {
	if status, code := httpErr(err); status != 0 {
		return c.Status(status).JSON(fiber.Map{"error": code})
	}
	return c.Status(500).JSON(fiber.Map{"error": fallbackCode})
}
