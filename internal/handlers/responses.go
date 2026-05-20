package handlers

import (
	"time"

	"github.com/google/uuid"
	"github.com/obeej/akin/internal/models"
	"github.com/obeej/akin/internal/service"
)

// userResponse — safe user shape. Excludes password hash, exposes only
// what the frontend needs.
type userResponse struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	FirstName string    `json:"firstName"`
	LastName  string    `json:"lastName"`
	Phone     string    `json:"phone"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
}

func toUserResponse(u *models.User) userResponse {
	return userResponse{
		ID:        u.ID,
		Email:     u.Email,
		FirstName: u.FirstName,
		LastName:  u.LastName,
		Phone:     u.PhoneE164,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
	}
}

// depositResponse — excludes authorization URL after it's been consumed.
type depositResponse struct {
	ID                uuid.UUID  `json:"id"`
	AmountKobo        int64      `json:"amountKobo"`
	Currency          string     `json:"currency"`
	Frequency         string     `json:"frequency"`
	Status            string     `json:"status"`
	PaystackReference string     `json:"paystackReference"`
	CreatedAt         time.Time  `json:"createdAt"`
	SettledAt         *time.Time `json:"settledAt,omitempty"`
}

func toDepositResponse(d *models.GiverDeposit) depositResponse {
	return depositResponse{
		ID:                d.ID,
		AmountKobo:        d.AmountKobo,
		Currency:          d.Currency,
		Frequency:         d.Frequency,
		Status:            d.Status,
		PaystackReference: d.PaystackReference,
		CreatedAt:         d.CreatedAt,
		SettledAt:         d.SettledAt,
	}
}

// recipientResponse — deliberately omits UserID to preserve
// pseudonymity across the steward review process.
type recipientResponse struct {
	ID                   uuid.UUID  `json:"id"`
	PseudonymousID       string     `json:"pseudonymousId"`
	Status               string     `json:"status"`
	DisbursementMethod   string     `json:"disbursementMethod"`
	WeeklyCapKobo        int64      `json:"weeklyCapKobo"`
	IntakeWeeklyCostKobo int64      `json:"intakeWeeklyCostKobo"`
	IntakeSituation      string     `json:"intakeSituation"`
	CreatedAt            time.Time  `json:"createdAt"`
	DecidedAt            *time.Time `json:"decidedAt,omitempty"`
}

func toRecipientResponse(r *models.Recipient) recipientResponse {
	return recipientResponse{
		ID:                   r.ID,
		PseudonymousID:       r.PseudonymousID,
		Status:               r.Status,
		DisbursementMethod:   r.DisbursementMethod,
		WeeklyCapKobo:        r.WeeklyCapKobo,
		IntakeWeeklyCostKobo: r.IntakeWeeklyCostKobo,
		IntakeSituation:      r.IntakeSituation,
		CreatedAt:            r.CreatedAt,
		DecidedAt:            r.DecidedAt,
	}
}

// approvedRecipientResponse — steward payout view, includes bank info.
type approvedRecipientResponse struct {
	recipientResponse
	HasBank     bool   `json:"hasBank"`
	BankName    string `json:"bankName,omitempty"`
	AccountName string `json:"accountName,omitempty"`
}

func toApprovedRecipientResponse(ar service.ApprovedRecipient) approvedRecipientResponse {
	return approvedRecipientResponse{
		recipientResponse: toRecipientResponse(&ar.Recipient),
		HasBank:           ar.HasBank,
		BankName:          ar.BankName,
		AccountName:       ar.AccountName,
	}
}
