// Crypto price state for the donation form: fetches the base-currency price of
// the selected token from the backend with retry logic and a local cache.
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchData, CRYPTO_PRICE } from '../../../../utils/apis';

export const useCryptoPrices = () => {
	const { t } = useTranslation();

	// Price state
	const [cryptoPrice, setCryptoPrice] = useState<number>(0);
	// The base currency the fetched price is quoted in (defaults to JPY until a
	// response arrives).
	const [priceCurrency, setPriceCurrency] = useState<string>('JPY');
	const [isPriceLoading, setIsPriceLoading] = useState<boolean>(false);
	const [priceError, setPriceError] = useState<string>('');

	// Local price cache (in addition to backend cache)
	const priceCacheRef = useRef<Map<string, { price: number; timestamp: number }>>(new Map());
	const PRICE_CACHE_DURATION = 30 * 1000; // 30 seconds local cache

	// Fetch crypto price with retry logic and caching
	// Note: No fallback prices - if API fails, the conversion will not be shown
	const fetchCryptoPrice = useCallback(async (coinGeckoId: string, retryCount = 0) => {
		if (!coinGeckoId) {
			setCryptoPrice(0);
			setPriceError('');
			return;
		}

		// Check local cache first
		const cached = priceCacheRef.current.get(coinGeckoId);
		if (cached && Date.now() - cached.timestamp < PRICE_CACHE_DURATION) {
			setCryptoPrice(cached.price);
			setPriceError('');
			return;
		}

		setIsPriceLoading(true);
		setPriceError('');

		const maxRetries = 3;
		const retryDelay = 1000 * (retryCount + 1); // Exponential backoff: 1s, 2s, 3s

		try {
			const response = await fetchData(`${CRYPTO_PRICE}?coin=${coinGeckoId}`, {
				auth: false,
			});
			// `price` is the base-currency field; `priceJpy` is the deprecated
			// JPY-only alias kept for older servers.
			const price = response.price ?? response.priceJpy;
			if (response.success && price) {
				setCryptoPrice(price);
				setPriceCurrency(response.currency || 'JPY');
				setPriceError('');
				// Update local cache
				priceCacheRef.current.set(coinGeckoId, { price, timestamp: Date.now() });
			} else {
				throw new Error(response.error || 'Price not available');
			}
		} catch (error) {
			console.error(`Failed to fetch crypto price (attempt ${retryCount + 1}):`, error);

			// Retry logic
			if (retryCount < maxRetries) {
				setTimeout(() => {
					fetchCryptoPrice(coinGeckoId, retryCount + 1);
				}, retryDelay);
				return;
			}

			// All retries failed - do not use fallback prices for financial accuracy
			setCryptoPrice(0);
			setPriceError(t('donation.priceFetchFailed'));
		} finally {
			setIsPriceLoading(false);
		}
	}, []);

	return {
		cryptoPrice,
		setCryptoPrice,
		priceCurrency,
		isPriceLoading,
		priceError,
		fetchCryptoPrice,
	};
};
