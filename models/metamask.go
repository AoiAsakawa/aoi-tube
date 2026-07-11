package models

// MetamaskConfig represents the Metamask configuration for donations.
type MetamaskConfig struct {
	Enabled        bool   `json:"enabled"`
	WalletAddress  string `json:"walletAddress"`
	BitcoinAddress string `json:"bitcoinAddress,omitempty"` // Bitcoin Native SegWit address (bc1...)
	// SolanaAddress is the operator's Solana account (base58 pubkey) that SOL and
	// SPL-token donations are paid to. It cannot share WalletAddress: that is an
	// EVM 0x address, which is not a valid Solana pubkey.
	SolanaAddress string `json:"solanaAddress,omitempty"`
	// SolanaRPCURL overrides the Solana JSON-RPC node. The public
	// api.mainnet-beta.solana.com is heavily rate limited and refuses browser
	// requests outright, so a production deployment should point this at its own
	// provider (Helius, QuickNode, Alchemy, ...). Empty falls back to the public
	// node. The browser never talks to it directly — requests are proxied through
	// /api/solana/rpc, so a URL containing an API key stays server-side.
	SolanaRPCURL  string `json:"solanaRpcUrl,omitempty"`
	NetworkID     int64  `json:"networkId"`     // 1 = Mainnet, 11155111 = Sepolia, 137 = Polygon
	NetworkName   string `json:"networkName"`   // Display name
	ChainCurrency string `json:"chainCurrency"` // ETH, MATIC, BNB, etc.
	// Custom token support
	UseCustomToken bool   `json:"useCustomToken"` // Use ERC-20 token instead of native currency
	TokenAddress   string `json:"tokenAddress"`   // ERC-20 token contract address
	TokenSymbol    string `json:"tokenSymbol"`    // Token symbol (USDT, USDC, etc.)
	TokenDecimals  int    `json:"tokenDecimals"`  // Token decimals (usually 18 or 6)
	// Price display
	CoinGeckoID  string `json:"coinGeckoId"`  // CoinGecko ID for price lookup (ethereum, matic-network, etc.)
	ShowJPYPrice bool   `json:"showJpyPrice"` // Show JPY equivalent price
}

// MetamaskDonationRequest represents a donation request via Metamask.
type MetamaskDonationRequest struct {
	Amount          float64 `json:"amount"`    // Amount in chain currency or token
	AmountJPY       float64 `json:"amountJpy"` // Amount in JPY (for display)
	Message         string  `json:"message"`
	DisplayName     string  `json:"displayName"`
	IsAnonymous     bool    `json:"isAnonymous"`
	TransactionHash string  `json:"transactionHash"`
	FromAddress     string  `json:"fromAddress"`
	TokenSymbol     string  `json:"tokenSymbol"` // Symbol of token used (ETH, MATIC, USDT, etc.)
	// NetworkID is the chain the buyer actually transacted on (the donation
	// form lets them pick any supported chain). The server verifies on this
	// chain, not just the operator's configured one, since the operator's
	// wallet address is the same across EVM chains.
	NetworkID int64 `json:"networkId"`
	// ItemType selects the purchase: "superchat" (default) or "effect".
	ItemType string `json:"itemType"`
	// EffectType is the screen effect to play when ItemType is "effect".
	EffectType string `json:"effectType"`
}

// NetworkPreset represents a predefined blockchain network configuration.
type NetworkPreset struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Currency    string `json:"currency"`
	CoinGeckoID string `json:"coinGeckoId"`
	RPCUrl      string `json:"rpcUrl,omitempty"`
}

// TokenPreset represents a predefined ERC-20 token configuration.
type TokenPreset struct {
	Symbol      string           `json:"symbol"`
	Name        string           `json:"name"`
	Decimals    int              `json:"decimals"`
	CoinGeckoID string           `json:"coinGeckoId"`
	Addresses   map[int64]string `json:"addresses"` // Network ID -> Contract address
}
