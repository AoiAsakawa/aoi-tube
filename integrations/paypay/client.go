package paypay

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/aoiasakawa/aoitube/models"
	log "github.com/sirupsen/logrus"
)

const (
	// PayPay API endpoints
	productionBaseURL = "https://api.paypay.ne.jp"
	sandboxBaseURL    = "https://stg-api.sandbox.paypay.ne.jp"

	// API paths
	createQRCodePath  = "/v2/codes"
	getPaymentPath    = "/v2/codes/payments"
	deleteQRCodePath  = "/v2/codes"
	refundPaymentPath = "/v1/subscription/payments/refund"
)

// Client is the PayPay API client.
type Client struct {
	config  *models.PayPayConfig
	baseURL string
}

// NewClient creates a new PayPay API client.
func NewClient(config *models.PayPayConfig) *Client {
	baseURL := productionBaseURL
	if config.IsSandbox {
		baseURL = sandboxBaseURL
	}
	return &Client{
		config:  config,
		baseURL: baseURL,
	}
}

// CreateQRCode creates a PayPay QR code for payment.
func (c *Client) CreateQRCode(req *models.PayPayPaymentRequest) (*models.PayPayPaymentResponse, error) {
	if !c.config.Enabled {
		return nil, fmt.Errorf("PayPay is not enabled")
	}

	payload := map[string]interface{}{
		"merchantPaymentId": req.OrderID,
		"amount": map[string]interface{}{
			"amount":   req.Amount,
			"currency": "JPY",
		},
		"codeType":         "ORDER_QR",
		"orderDescription": req.Description,
		"isAuthorization":  false,
		"redirectUrl":      req.RedirectURL,
		"redirectType":     "WEB_LINK",
		"requestedAt":      time.Now().Unix(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.doRequest("POST", createQRCodePath, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		ResultInfo struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"resultInfo"`
		Data struct {
			CodeID     string `json:"codeId"`
			URL        string `json:"url"`
			ExpiryDate int64  `json:"expiryDate"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if result.ResultInfo.Code != "SUCCESS" {
		return &models.PayPayPaymentResponse{
			Success:      false,
			ErrorCode:    result.ResultInfo.Code,
			ErrorMessage: result.ResultInfo.Message,
		}, nil
	}

	return &models.PayPayPaymentResponse{
		Success:    true,
		PaymentID:  result.Data.CodeID,
		PaymentURL: result.Data.URL,
	}, nil
}

// GetPaymentDetails gets the payment details.
func (c *Client) GetPaymentDetails(merchantPaymentID string) (*PaymentDetails, error) {
	if !c.config.Enabled {
		return nil, fmt.Errorf("PayPay is not enabled")
	}

	path := fmt.Sprintf("%s/%s", getPaymentPath, merchantPaymentID)
	resp, err := c.doRequest("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	log.Infof("PayPay GetPaymentDetails response: %s", string(respBody))

	var result struct {
		ResultInfo struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"resultInfo"`
		Data PaymentDetails `json:"data"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if result.ResultInfo.Code != "SUCCESS" {
		return nil, fmt.Errorf("PayPay API error: %s - %s", result.ResultInfo.Code, result.ResultInfo.Message)
	}

	return &result.Data, nil
}

// PaymentDetails represents the payment details from PayPay.
type PaymentDetails struct {
	PaymentID         string `json:"paymentId"`
	MerchantPaymentID string `json:"merchantPaymentId"`
	State             string `json:"status"`
	Amount            struct {
		Amount   int32  `json:"amount"`
		Currency string `json:"currency"`
	} `json:"amount"`
	AcceptedAt int64 `json:"acceptedAt"`
}

// DeleteQRCode deletes a QR code.
func (c *Client) DeleteQRCode(codeID string) error {
	if !c.config.Enabled {
		return fmt.Errorf("PayPay is not enabled")
	}

	path := fmt.Sprintf("%s/%s", deleteQRCodePath, codeID)
	resp, err := c.doRequest("DELETE", path, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// doRequest performs an authenticated request to PayPay API.
func (c *Client) doRequest(method, path string, body []byte) (*http.Response, error) {
	url := c.baseURL + path

	var req *http.Request
	var err error

	if body != nil {
		req, err = http.NewRequest(method, url, bytes.NewReader(body))
	} else {
		req, err = http.NewRequest(method, url, nil)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	nonce := generateNonce()
	epoch := strconv.FormatInt(time.Now().Unix(), 10)
	// PayPay documentation requires trailing semicolon
	contentType := "application/json;charset=UTF-8;"

	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", c.generateAuthHeader(method, path, contentType, nonce, epoch, body))
	// Sandbox environment requires X-ASSUME-MERCHANT header
	if merchantID := c.config.GetActiveMerchantID(); c.config.IsSandbox && merchantID != "" {
		req.Header.Set("X-ASSUME-MERCHANT", merchantID)
	}

	log.Debugf("PayPay Request - URL: %s, Method: %s", url, method)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	log.Debugf("PayPay API response status: %d", resp.StatusCode)

	return resp, nil
}

// generateAuthHeader generates the HMAC-SHA256 auth header for PayPay API.
// Based on PayPay HMAC authentication documentation:
// https://www.paypay.ne.jp/opa/doc/jp/v1.0/api_authorization.html
func (c *Client) generateAuthHeader(method, path, contentType, nonce, epoch string, body []byte) string {
	var hash string

	// Step 1: MD5 hash of content-type + request body
	if body != nil && len(body) > 0 {
		md5Hash := md5.New()
		md5Hash.Write([]byte(contentType))
		md5Hash.Write(body)
		hash = base64.StdEncoding.EncodeToString(md5Hash.Sum(nil))
	} else {
		// For GET requests or empty body, use "empty"
		hash = "empty"
	}

	// Step 2: Create signature string
	// Format: requestUri\nmethod\nnonce\nepoch\ncontentType\nhash
	var signatureString string
	if body != nil && len(body) > 0 {
		signatureString = fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s",
			path,
			method,
			nonce,
			epoch,
			contentType,
			hash,
		)
	} else {
		// For GET requests, content-type and hash are "empty"
		signatureString = fmt.Sprintf("%s\n%s\n%s\n%s\nempty\nempty",
			path,
			method,
			nonce,
			epoch,
		)
	}

	log.Debugf("PayPay Auth - Path: %s, Method: %s", path, method)

	// Step 3: HMAC-SHA256 with API secret
	mac := hmac.New(sha256.New, []byte(c.config.GetActiveAPISecret()))
	mac.Write([]byte(signatureString))
	macData := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	// Step 4: Build auth header
	// Format: hmac OPA-Auth:api-key:macData:nonce:epoch:hash
	authHeader := fmt.Sprintf("hmac OPA-Auth:%s:%s:%s:%s:%s",
		c.config.GetActiveAPIKey(),
		macData,
		nonce,
		epoch,
		hash,
	)

	log.Debugf("PayPay Auth - Header generated")

	return authHeader
}

// generateNonce generates a unique nonce for the request.
// PayPay example uses random alphanumeric string
func generateNonce() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

// ValidateWebhookSignature validates the webhook signature from PayPay.
func ValidateWebhookSignature(payload []byte, signature string, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSignature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
