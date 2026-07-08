package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aoiasakawa/aoitube/models"
)

// metamaskRPCEndpoints maps a chain ID to a public JSON-RPC endpoint used to
// verify EVM donation transactions on-chain. These are keyless public nodes;
// operators who need higher reliability can front them with their own proxy.
var metamaskRPCEndpoints = map[int64]string{
	1:        "https://ethereum-rpc.publicnode.com",
	11155111: "https://ethereum-sepolia-rpc.publicnode.com",
	137:      "https://polygon-bor-rpc.publicnode.com",
	80002:    "https://polygon-amoy-bor-rpc.publicnode.com",
	56:       "https://bsc-rpc.publicnode.com",
	42161:    "https://arbitrum-one-rpc.publicnode.com",
	10:       "https://optimism-rpc.publicnode.com",
	8453:     "https://base-rpc.publicnode.com",
	43114:    "https://avalanche-c-chain-rpc.publicnode.com",
}

// erc20TransferSig is keccak256("Transfer(address,address,uint256)").
const erc20TransferSig = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

type ethTransaction struct {
	To    string `json:"to"`
	From  string `json:"from"`
	Value string `json:"value"`
	Input string `json:"input"`
}

type ethLog struct {
	Address string   `json:"address"`
	Topics  []string `json:"topics"`
	Data    string   `json:"data"`
}

type ethReceipt struct {
	Status string   `json:"status"`
	Logs   []ethLog `json:"logs"`
}

// ethRPCCall performs a single JSON-RPC call and unmarshals the result.
func ethRPCCall(rpcURL, method string, params []interface{}, out interface{}) error {
	reqBody, err := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
		"id":      1,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", rpcURL, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return err
	}
	if envelope.Error != nil {
		return fmt.Errorf("rpc error: %s", envelope.Error.Message)
	}
	if len(envelope.Result) == 0 || string(envelope.Result) == "null" {
		return fmt.Errorf("transaction not found")
	}
	return json.Unmarshal(envelope.Result, out)
}

// hexToBigInt parses a 0x-prefixed hex quantity.
func hexToBigInt(s string) (*big.Int, bool) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "0x")
	if s == "" {
		return big.NewInt(0), true
	}
	return new(big.Int).SetString(s, 16)
}

// smallestUnitToDisplay converts an on-chain value (in a token's smallest unit)
// to the internal donation display amount, which is the human amount * 1e8.
func smallestUnitToDisplay(value *big.Int, decimals int) (int64, error) {
	if decimals < 0 {
		decimals = 0
	}
	num := new(big.Int).Mul(value, big.NewInt(100000000)) // scale to 1e8 fixed point
	den := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)
	res := new(big.Int).Quo(num, den)
	if !res.IsInt64() {
		return 0, fmt.Errorf("amount out of range")
	}
	return res.Int64(), nil
}

// findERC20TransferValue returns the value of a Transfer log from the given token
// contract to the given wallet, if present in the receipt.
func findERC20TransferValue(logs []ethLog, tokenContract, wallet string) (*big.Int, bool) {
	walletTopic := "0x000000000000000000000000" + strings.ToLower(strings.TrimPrefix(wallet, "0x"))
	for _, lg := range logs {
		if !strings.EqualFold(lg.Address, tokenContract) {
			continue
		}
		if len(lg.Topics) < 3 {
			continue
		}
		if !strings.EqualFold(lg.Topics[0], erc20TransferSig) {
			continue
		}
		if !strings.EqualFold(lg.Topics[2], walletTopic) {
			continue
		}
		if val, ok := hexToBigInt(lg.Data); ok {
			return val, true
		}
	}
	return nil, false
}

// verifyBitcoinTx confirms that a Bitcoin transaction paid the configured
// address, returning the total satoshis sent to it.
func verifyBitcoinTx(txid, address string) (int64, bool) {
	endpoint := "https://mempool.space/api/tx/" + url.PathEscape(txid)
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		return 0, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, false
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return 0, false
	}

	var tx struct {
		Vout []struct {
			ScriptpubkeyAddress string `json:"scriptpubkey_address"`
			Value               int64  `json:"value"`
		} `json:"vout"`
	}
	if err := json.Unmarshal(body, &tx); err != nil {
		return 0, false
	}

	var total int64
	for _, v := range tx.Vout {
		if strings.EqualFold(v.ScriptpubkeyAddress, address) {
			total += v.Value
		}
	}
	if total <= 0 {
		return 0, false
	}
	return total, true
}

// verifyMetamaskDonation verifies the donation transaction on-chain and returns
// the trustworthy display amount (human amount * 1e8) taken from the chain, not
// from the client. It returns an error if the payment cannot be confirmed, so
// callers can fail closed.
func verifyMetamaskDonation(config models.MetamaskConfig, request models.MetamaskDonationRequest) (int64, error) {
	txhash := request.TransactionHash
	isEVM := strings.HasPrefix(txhash, "0x") && len(txhash) == 66
	isBTC := !strings.HasPrefix(txhash, "0x") && len(txhash) == 64

	if isBTC {
		if config.BitcoinAddress == "" {
			return 0, fmt.Errorf("bitcoin address not configured")
		}
		sats, ok := verifyBitcoinTx(txhash, config.BitcoinAddress)
		if !ok {
			return 0, fmt.Errorf("no Bitcoin output to the configured address")
		}
		return smallestUnitToDisplay(big.NewInt(sats), 8)
	}

	if !isEVM {
		return 0, fmt.Errorf("unsupported transaction hash format")
	}

	rpcURL := metamaskRPCEndpoints[config.NetworkID]
	if rpcURL == "" {
		return 0, fmt.Errorf("no RPC endpoint available for network %d", config.NetworkID)
	}
	if config.WalletAddress == "" {
		return 0, fmt.Errorf("wallet address not configured")
	}

	var tx ethTransaction
	if err := ethRPCCall(rpcURL, "eth_getTransactionByHash", []interface{}{txhash}, &tx); err != nil {
		return 0, fmt.Errorf("transaction lookup failed: %w", err)
	}

	var receipt ethReceipt
	if err := ethRPCCall(rpcURL, "eth_getTransactionReceipt", []interface{}{txhash}, &receipt); err != nil {
		return 0, fmt.Errorf("receipt lookup failed: %w", err)
	}
	// status "0x1" == success; "0x0" == reverted.
	if receipt.Status != "0x1" {
		return 0, fmt.Errorf("transaction did not succeed on-chain")
	}

	// ERC-20 token transfer.
	if config.UseCustomToken && config.TokenAddress != "" {
		if !strings.EqualFold(tx.To, config.TokenAddress) {
			return 0, fmt.Errorf("transaction not sent to the configured token contract")
		}
		val, ok := findERC20TransferValue(receipt.Logs, config.TokenAddress, config.WalletAddress)
		if !ok {
			return 0, fmt.Errorf("no matching ERC-20 transfer to the configured wallet")
		}
		decimals := config.TokenDecimals
		if decimals <= 0 {
			decimals = 18
		}
		return smallestUnitToDisplay(val, decimals)
	}

	// Native coin transfer.
	if !strings.EqualFold(tx.To, config.WalletAddress) {
		return 0, fmt.Errorf("transaction not sent to the configured wallet")
	}
	val, ok := hexToBigInt(tx.Value)
	if !ok || val.Sign() <= 0 {
		return 0, fmt.Errorf("invalid transaction value")
	}
	return smallestUnitToDisplay(val, 18)
}
