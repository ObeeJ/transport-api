package paystack

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/obeej/akin/internal/payments"
)

const apiBase = "https://api.paystack.co"

type Client struct {
	secretKey string
	http      *http.Client
}

func New(secretKey string) *Client {
	return &Client{
		secretKey: secretKey,
		http:      &http.Client{Timeout: 15 * time.Second},
	}
}

// Compile-time check that we implement the interface.
var _ payments.DisbursementProvider = (*Client)(nil)

type initBody struct {
	Email       string            `json:"email"`
	Amount      int64             `json:"amount"`
	Reference   string            `json:"reference"`
	CallbackURL string            `json:"callback_url,omitempty"`
	Currency    string            `json:"currency,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

type initResp struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		AuthorizationURL string `json:"authorization_url"`
		AccessCode       string `json:"access_code"`
		Reference        string `json:"reference"`
	} `json:"data"`
}

type verifyResp struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Status    string `json:"status"`
		Reference string `json:"reference"`
		Amount    int64  `json:"amount"`
	} `json:"data"`
}

func (c *Client) Initialize(ctx context.Context, req payments.InitializeRequest) (*payments.InitializeResponse, error) {
	body, err := json.Marshal(initBody{
		Email:       req.Email,
		Amount:      req.AmountKobo,
		Reference:   req.Reference,
		CallbackURL: req.CallbackURL,
		Currency:    "NGN",
		Metadata:    req.Metadata,
	})
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/transaction/initialize", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.secretKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	res, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("paystack initialize: %w", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode/100 != 2 {
		return nil, fmt.Errorf("paystack initialize status %d: %s", res.StatusCode, string(raw))
	}

	var parsed initResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("paystack initialize decode: %w", err)
	}
	if !parsed.Status {
		return nil, fmt.Errorf("paystack initialize: %s", parsed.Message)
	}
	return &payments.InitializeResponse{
		AuthorizationURL: parsed.Data.AuthorizationURL,
		Reference:        parsed.Data.Reference,
	}, nil
}

func (c *Client) Verify(ctx context.Context, reference string) (*payments.VerifyResponse, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, apiBase+"/transaction/verify/"+reference, nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.secretKey)
	httpReq.Header.Set("Accept", "application/json")

	res, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("paystack verify: %w", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode/100 != 2 {
		return nil, fmt.Errorf("paystack verify status %d: %s", res.StatusCode, string(raw))
	}

	var parsed verifyResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("paystack verify decode: %w", err)
	}
	return &payments.VerifyResponse{
		Status:     parsed.Data.Status,
		AmountKobo: parsed.Data.Amount,
		Reference:  parsed.Data.Reference,
	}, nil
}

// --- Banks ---------------------------------------------------------------

type bankListResp struct {
	Status bool             `json:"status"`
	Data   []payments.Bank  `json:"data"`
}

func (c *Client) ListBanks(ctx context.Context) ([]payments.Bank, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiBase+"/bank?country=nigeria", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Accept", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paystack list banks: %w", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode/100 != 2 {
		return nil, fmt.Errorf("paystack list banks status %d: %s", res.StatusCode, string(raw))
	}
	var parsed bankListResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("paystack list banks decode: %w", err)
	}
	return parsed.Data, nil
}

// --- Resolve account -----------------------------------------------------

type resolveResp struct {
	Status bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		AccountNumber string `json:"account_number"`
		AccountName   string `json:"account_name"`
	} `json:"data"`
}

func (c *Client) ResolveAccount(ctx context.Context, bankCode, accountNumber string) (*payments.ResolvedAccount, error) {
	url := fmt.Sprintf("%s/bank/resolve?account_number=%s&bank_code=%s", apiBase, accountNumber, bankCode)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Accept", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paystack resolve: %w", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	var parsed resolveResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("paystack resolve decode: %w", err)
	}
	if res.StatusCode/100 != 2 || !parsed.Status {
		return nil, fmt.Errorf("paystack resolve: %s", parsed.Message)
	}
	return &payments.ResolvedAccount{
		AccountNumber: parsed.Data.AccountNumber,
		AccountName:   parsed.Data.AccountName,
	}, nil
}

// --- Transfer recipient --------------------------------------------------

type createRecipientBody struct {
	Type          string `json:"type"`
	Name          string `json:"name"`
	AccountNumber string `json:"account_number"`
	BankCode      string `json:"bank_code"`
	Currency      string `json:"currency"`
}

type createRecipientResp struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		RecipientCode string `json:"recipient_code"`
		Details       struct {
			AccountName string `json:"account_name"`
		} `json:"details"`
	} `json:"data"`
}

func (c *Client) CreateTransferRecipient(ctx context.Context, r payments.TransferRecipientRequest) (*payments.TransferRecipient, error) {
	body, _ := json.Marshal(createRecipientBody{
		Type:          "nuban",
		Name:          r.Name,
		AccountNumber: r.AccountNumber,
		BankCode:      r.BankCode,
		Currency:      r.Currency,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/transferrecipient", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paystack create recipient: %w", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	var parsed createRecipientResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("paystack create recipient decode: %w", err)
	}
	if res.StatusCode/100 != 2 || !parsed.Status {
		return nil, fmt.Errorf("paystack create recipient: %s", parsed.Message)
	}
	return &payments.TransferRecipient{
		RecipientCode: parsed.Data.RecipientCode,
		AccountName:   parsed.Data.Details.AccountName,
	}, nil
}

// --- Initiate transfer ---------------------------------------------------

type initiateTransferBody struct {
	Source    string `json:"source"`
	Amount    int64  `json:"amount"`
	Recipient string `json:"recipient"`
	Reference string `json:"reference"`
	Reason    string `json:"reason"`
}

type initiateTransferResp struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		TransferCode string `json:"transfer_code"`
		Status       string `json:"status"`
		Reference    string `json:"reference"`
	} `json:"data"`
}

func (c *Client) InitiateTransfer(ctx context.Context, t payments.TransferRequest) (*payments.TransferResponse, error) {
	body, _ := json.Marshal(initiateTransferBody{
		Source:    "balance",
		Amount:    t.AmountKobo,
		Recipient: t.RecipientCode,
		Reference: t.Reference,
		Reason:    t.Reason,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBase+"/transfer", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paystack initiate transfer: %w", err)
	}
	defer res.Body.Close()

	raw, _ := io.ReadAll(res.Body)
	var parsed initiateTransferResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("paystack initiate transfer decode: %w", err)
	}
	if res.StatusCode/100 != 2 || !parsed.Status {
		return nil, fmt.Errorf("paystack initiate transfer: %s", parsed.Message)
	}
	return &payments.TransferResponse{
		TransferCode: parsed.Data.TransferCode,
		Status:       parsed.Data.Status,
		Reference:    parsed.Data.Reference,
	}, nil
}

// --- Webhook signature ---------------------------------------------------

func (c *Client) VerifyWebhookSignature(body []byte, signatureHeader string) bool {
	if c.secretKey == "" || signatureHeader == "" {
		return false
	}
	mac := hmac.New(sha512.New, []byte(c.secretKey))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signatureHeader))
}
