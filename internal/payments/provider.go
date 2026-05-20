package payments

import "context"

// DisbursementProvider is the boundary between Akin and any payment
// processor. Implementations live under internal/payments/<provider>/.
// V2 partner-transport vouchers will implement this same interface.
type DisbursementProvider interface {
	// Inbound (giver deposits)
	Initialize(ctx context.Context, req InitializeRequest) (*InitializeResponse, error)
	Verify(ctx context.Context, reference string) (*VerifyResponse, error)
	VerifyWebhookSignature(body []byte, signatureHeader string) bool

	// Outbound (payouts to recipients)
	ListBanks(ctx context.Context) ([]Bank, error)
	ResolveAccount(ctx context.Context, bankCode, accountNumber string) (*ResolvedAccount, error)
	CreateTransferRecipient(ctx context.Context, req TransferRecipientRequest) (*TransferRecipient, error)
	InitiateTransfer(ctx context.Context, req TransferRequest) (*TransferResponse, error)
}

type InitializeRequest struct {
	Email       string
	AmountKobo  int64
	Reference   string
	CallbackURL string
	Metadata    map[string]string
}

type InitializeResponse struct {
	AuthorizationURL string
	Reference        string
}

type VerifyResponse struct {
	Status     string // "success", "failed", "abandoned", ...
	AmountKobo int64
	Reference  string
}

// Bank — a single entry in the supported-banks list.
type Bank struct {
	Name string `json:"name"`
	Code string `json:"code"` // sort code Paystack uses to identify the bank
	Slug string `json:"slug"`
}

// ResolvedAccount — what the provider says about an account number.
// Used to confirm to the user "yes, this account belongs to <name>"
// before we save it.
type ResolvedAccount struct {
	AccountNumber string `json:"accountNumber"`
	AccountName   string `json:"accountName"`
}

// TransferRecipientRequest — register a payee with the provider.
// Returns a stable code we use on every subsequent transfer to this person.
type TransferRecipientRequest struct {
	Name          string
	AccountNumber string
	BankCode      string
	Currency      string // "NGN"
}

type TransferRecipient struct {
	RecipientCode string // provider-side stable handle
	AccountName   string
}

// TransferRequest — actually move money out.
type TransferRequest struct {
	RecipientCode string
	AmountKobo    int64
	Reference     string // our reference, used for idempotency + webhook matching
	Reason        string // shown on the recipient's statement
}

type TransferResponse struct {
	TransferCode string // provider's id for this transfer
	Status       string // "pending", "success", "otp" (requires OTP), "failed"
	Reference    string
}
