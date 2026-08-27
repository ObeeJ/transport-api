// Package storage provides Cloudflare R2 presigned URL generation.
// R2 is S3-compatible so we use standard AWS SDK v4 signing.
package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"time"
)

type R2Client struct {
	accountID       string
	accessKeyID     string
	secretAccessKey string
	bucket          string
}

func NewR2Client(accountID, accessKeyID, secretAccessKey, bucket string) *R2Client {
	return &R2Client{
		accountID:       accountID,
		accessKeyID:     accessKeyID,
		secretAccessKey: secretAccessKey,
		bucket:          bucket,
	}
}

// PresignedUploadURL returns a presigned PUT URL valid for 15 minutes.
func (c *R2Client) PresignedUploadURL(key, contentType string) (string, error) {
	if c.accessKeyID == "" {
		return "", fmt.Errorf("r2: not configured")
	}
	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com/%s/%s",
		c.accountID, c.bucket, url.PathEscape(key))

	now := time.Now().UTC()
	date := now.Format("20060102")
	datetime := now.Format("20060102T150405Z")
	expires := "900" // 15 min

	credentialScope := fmt.Sprintf("%s/auto/s3/aws4_request", date)
	credential := fmt.Sprintf("%s/%s", c.accessKeyID, credentialScope)

	query := url.Values{}
	query.Set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
	query.Set("X-Amz-Credential", credential)
	query.Set("X-Amz-Date", datetime)
	query.Set("X-Amz-Expires", expires)
	query.Set("X-Amz-SignedHeaders", "content-type;host")

	host := fmt.Sprintf("%s.r2.cloudflarestorage.com", c.accountID)
	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\n", contentType, host)
	canonicalRequest := fmt.Sprintf("PUT\n/%s/%s\n%s\n%s\ncontent-type;host\nUNSIGNED-PAYLOAD",
		c.bucket, key, query.Encode(), canonicalHeaders)

	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
		datetime, credentialScope, hashSHA256(canonicalRequest))

	signingKey := deriveSigningKey(c.secretAccessKey, date, "auto", "s3")
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))

	query.Set("X-Amz-Signature", signature)
	return endpoint + "?" + query.Encode(), nil
}

func hashSHA256(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func deriveSigningKey(secret, date, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), date)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	return hmacSHA256(kService, "aws4_request")
}
