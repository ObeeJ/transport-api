package kyc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// PremblyClient calls the Prembly identity verification API.
type PremblyClient struct {
	apiKey  string
	appID   string
	baseURL string
	http    *http.Client
}

func NewPremblyClient(apiKey, appID string) *PremblyClient {
	return &PremblyClient{
		apiKey:  apiKey,
		appID:   appID,
		baseURL: "https://api.prembly.com/identitypass/verification",
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// VerifyNIN calls Prembly NIN verification. Returns raw response, verified bool, error.
func (c *PremblyClient) VerifyNIN(nin string) (map[string]any, bool, error) {
	if c.apiKey == "" {
		return nil, false, fmt.Errorf("prembly: not configured")
	}
	body := fmt.Sprintf(`{"number":"%s"}`, nin)
	req, err := http.NewRequest("POST", c.baseURL+"/nin", strings.NewReader(body))
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("app-id", c.appID)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, false, err
	}

	verified := false
	if status, ok := result["status"].(bool); ok && status {
		verified = true
	}
	return result, verified, nil
}
