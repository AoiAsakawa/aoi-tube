package data

import (
	"github.com/aoiasakawa/aoitube/models"
)

const (
	metamaskEnabledKey        = "metamask_enabled"
	metamaskWalletAddressKey  = "metamask_wallet_address"
	metamaskBitcoinAddressKey = "metamask_bitcoin_address"
	metamaskSolanaAddressKey  = "metamask_solana_address"
	metamaskSolanaRPCURLKey   = "metamask_solana_rpc_url"
	metamaskNetworkIDKey      = "metamask_network_id"
	metamaskNetworkNameKey    = "metamask_network_name"
	metamaskChainCurrencyKey  = "metamask_chain_currency"
	metamaskUseCustomTokenKey = "metamask_use_custom_token"
	metamaskTokenAddressKey   = "metamask_token_address"
	metamaskTokenSymbolKey    = "metamask_token_symbol"
	metamaskTokenDecimalsKey  = "metamask_token_decimals"
	metamaskCoinGeckoIDKey    = "metamask_coingecko_id"
	metamaskShowJPYPriceKey   = "metamask_show_jpy_price"
)

// GetMetamaskConfig returns the Metamask configuration.
func GetMetamaskConfig() models.MetamaskConfig {
	enabled, _ := _datastore.GetBool(metamaskEnabledKey)
	walletAddress, _ := _datastore.GetString(metamaskWalletAddressKey)
	bitcoinAddress, _ := _datastore.GetString(metamaskBitcoinAddressKey)
	solanaAddress, _ := _datastore.GetString(metamaskSolanaAddressKey)
	solanaRPCURL, _ := _datastore.GetString(metamaskSolanaRPCURLKey)
	networkID, _ := _datastore.GetNumber(metamaskNetworkIDKey)
	networkName, _ := _datastore.GetString(metamaskNetworkNameKey)
	chainCurrency, _ := _datastore.GetString(metamaskChainCurrencyKey)
	useCustomToken, _ := _datastore.GetBool(metamaskUseCustomTokenKey)
	tokenAddress, _ := _datastore.GetString(metamaskTokenAddressKey)
	tokenSymbol, _ := _datastore.GetString(metamaskTokenSymbolKey)
	tokenDecimals, _ := _datastore.GetNumber(metamaskTokenDecimalsKey)
	coinGeckoID, _ := _datastore.GetString(metamaskCoinGeckoIDKey)
	showJPYPrice, _ := _datastore.GetBool(metamaskShowJPYPriceKey)

	if networkID == 0 {
		networkID = 1 // Default to Ethereum Mainnet
	}
	if networkName == "" {
		networkName = "Ethereum Mainnet"
	}
	if chainCurrency == "" {
		chainCurrency = "ETH"
	}
	if coinGeckoID == "" {
		coinGeckoID = "ethereum"
	}
	if tokenDecimals == 0 {
		tokenDecimals = 18
	}

	return models.MetamaskConfig{
		Enabled:        enabled,
		WalletAddress:  walletAddress,
		BitcoinAddress: bitcoinAddress,
		SolanaAddress:  solanaAddress,
		SolanaRPCURL:   solanaRPCURL,
		NetworkID:      int64(networkID),
		NetworkName:    networkName,
		ChainCurrency:  chainCurrency,
		UseCustomToken: useCustomToken,
		TokenAddress:   tokenAddress,
		TokenSymbol:    tokenSymbol,
		TokenDecimals:  int(tokenDecimals),
		CoinGeckoID:    coinGeckoID,
		ShowJPYPrice:   showJPYPrice,
	}
}

// SetMetamaskConfig saves the Metamask configuration.
func SetMetamaskConfig(config models.MetamaskConfig) error {
	if err := _datastore.SetBool(metamaskEnabledKey, config.Enabled); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskWalletAddressKey, config.WalletAddress); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskBitcoinAddressKey, config.BitcoinAddress); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskSolanaAddressKey, config.SolanaAddress); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskSolanaRPCURLKey, config.SolanaRPCURL); err != nil {
		return err
	}
	if err := _datastore.SetNumber(metamaskNetworkIDKey, float64(config.NetworkID)); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskNetworkNameKey, config.NetworkName); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskChainCurrencyKey, config.ChainCurrency); err != nil {
		return err
	}
	if err := _datastore.SetBool(metamaskUseCustomTokenKey, config.UseCustomToken); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskTokenAddressKey, config.TokenAddress); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskTokenSymbolKey, config.TokenSymbol); err != nil {
		return err
	}
	if err := _datastore.SetNumber(metamaskTokenDecimalsKey, float64(config.TokenDecimals)); err != nil {
		return err
	}
	if err := _datastore.SetString(metamaskCoinGeckoIDKey, config.CoinGeckoID); err != nil {
		return err
	}
	if err := _datastore.SetBool(metamaskShowJPYPriceKey, config.ShowJPYPrice); err != nil {
		return err
	}
	return nil
}
