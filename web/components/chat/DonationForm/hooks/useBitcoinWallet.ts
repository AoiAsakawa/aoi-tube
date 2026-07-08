// Bitcoin wallet state and actions for the donation form: MetaMask btcsnap
// connection, address derivation, balance lookup (mempool.space) and PSBT
// based send flow.
import { useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import * as bitcoin from 'bitcoinjs-lib';
import { decimalToBigInt } from '../cryptoAmount';
import { LEGACY_BITCOIN_SNAP_ID, MEMPOOL_API } from '../constants';
import { MetamaskConfig } from '../types';
import { deriveAddressFromXpub, deriveFromXpub, findAddressWithBalance } from '../bitcoinUtils';
import { isTrustWalletConnected } from '../walletUtils';

interface UseBitcoinWalletArgs {
	metamaskConfig: MetamaskConfig | null;
	cryptoAmount: string;
}

export const useBitcoinWallet = ({ metamaskConfig, cryptoAmount }: UseBitcoinWalletArgs) => {
	const { t } = useTranslation();

	const [showBitcoinModal, setShowBitcoinModal] = useState<boolean>(false);
	const [bitcoinSendStep, setBitcoinSendStep] = useState<number>(0);
	const [bitcoinSendError, setBitcoinSendError] = useState<string>('');
	const [bitcoinAddress, setBitcoinAddress] = useState<string>(''); // User's Bitcoin address from Snap
	const [_bitcoinXpub, setBitcoinXpub] = useState<string>(''); // Extended public key
	const [_bitcoinMfp, setBitcoinMfp] = useState<string>(''); // Master fingerprint
	const [_bitcoinAddressIndex, setBitcoinAddressIndex] = useState<number>(0); // Address index used
	const [bitcoinBalance, setBitcoinBalance] = useState<number | null>(null); // Bitcoin balance in satoshi
	const [bitcoinFee, setBitcoinFee] = useState<number | null>(null); // Bitcoin fee in satoshi
	const [isLoadingBtcBalance, setIsLoadingBtcBalance] = useState<boolean>(false);
	const [_isSnapInstalled, setIsSnapInstalled] = useState<boolean>(false);
	const [activeSnapId, setActiveSnapId] = useState<string>(LEGACY_BITCOIN_SNAP_ID);

	// Connect to Bitcoin Snap and get user's address
	// Uses btcsnap (npm:btcsnap) which supports btc_signPsbt
	const connectBitcoinSnap = async (): Promise<string> => {
		if (!window.ethereum?.request) {
			throw new Error(t('donation.metamaskNotDetected'));
		}

		// Check for installed snaps
		let snaps: Record<string, unknown>;
		try {
			snaps = (await window.ethereum.request({
				method: 'wallet_getSnaps',
			})) as Record<string, unknown>;
		} catch {
			throw new Error(t('donation.snapsNotSupported'));
		}

		// Install btcsnap if not installed (we use legacy btcsnap which supports btc_signPsbt)
		if (!snaps[LEGACY_BITCOIN_SNAP_ID]) {
			try {
				await window.ethereum.request({
					method: 'wallet_requestSnaps',
					params: {
						[LEGACY_BITCOIN_SNAP_ID]: {},
					},
				});
			} catch {
				throw new Error(t('donation.bitcoinSnapInstallCancelled'));
			}
		}
		setIsSnapInstalled(true);
		setActiveSnapId(LEGACY_BITCOIN_SNAP_ID);

		// Set network to mainnet FIRST (required by btcsnap)
		await window.ethereum.request({
			method: 'wallet_invokeSnap',
			params: {
				snapId: LEGACY_BITCOIN_SNAP_ID,
				request: {
					method: 'btc_network',
					params: {
						action: 'set',
						network: 'main',
					},
				},
			},
		});

		// Get extended public key (P2WPKH = Native SegWit)
		const xpubResponse = (await window.ethereum.request({
			method: 'wallet_invokeSnap',
			params: {
				snapId: LEGACY_BITCOIN_SNAP_ID,
				request: {
					method: 'btc_getPublicExtendedKey',
					params: {
						network: 'main',
						scriptType: 'P2WPKH',
					},
				},
			},
		})) as { xpub: string; mfp: string };

		if (!xpubResponse || !xpubResponse.xpub) {
			throw new Error(t('donation.bitcoinAccountFailed'));
		}

		// Save xpub and mfp for later use
		setBitcoinXpub(xpubResponse.xpub);
		setBitcoinMfp(xpubResponse.mfp || '');

		// First try to derive address index 0
		let address = deriveAddressFromXpub(xpubResponse.xpub, 0);
		let addressIndex = 0;

		// Check if this address has balance, if not search for one that does
		try {
			const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
			if (response.ok) {
				const utxos = (await response.json()) as Array<{ value: number }>;
				if (utxos.length === 0) {
					// No UTXOs at index 0, search for address with balance
					const found = await findAddressWithBalance(xpubResponse.xpub);
					if (found) {
						address = found.address;
						addressIndex = found.index;
					}
				}
			}
		} catch {
			// UTXO check failed, use default address
		}

		// Save address index for PSBT signing
		setBitcoinAddressIndex(addressIndex);

		// Fetch balance after connecting
		fetchBitcoinBalance(address);

		return address;
	};

	// Trust Wallet doesn't support Bitcoin Snap, show instructions for manual transfer
	const connectTrustWalletBitcoin = async (): Promise<string> => {
		// Trust Wallet cannot connect to Bitcoin via browser extension
		// User needs to manually send BTC using the Trust Wallet app
		throw new Error(t('donation.trustWalletBitcoinUnsupported'));
	};

	// Universal Bitcoin connect function (Trust Wallet or MetaMask Snap)
	const connectBitcoin = async (): Promise<string> => {
		if (isTrustWalletConnected()) {
			return connectTrustWalletBitcoin();
		}
		return connectBitcoinSnap();
	};

	// Fetch Bitcoin balance from mempool.space
	const fetchBitcoinBalance = async (address: string) => {
		if (!address) return;

		setIsLoadingBtcBalance(true);
		try {
			// Fetch UTXOs to get balance
			const utxoResponse = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
			if (!utxoResponse.ok) {
				console.error(
					'Failed to fetch Bitcoin UTXOs:',
					utxoResponse.status,
					utxoResponse.statusText,
				);
				// Try fetching address info as fallback
				const addressResponse = await fetch(`${MEMPOOL_API}/address/${address}`);
				if (addressResponse.ok) {
					const addressInfo = (await addressResponse.json()) as {
						chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
						mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
					};
					const chainBalance =
						addressInfo.chain_stats.funded_txo_sum - addressInfo.chain_stats.spent_txo_sum;
					const mempoolBalance =
						addressInfo.mempool_stats.funded_txo_sum - addressInfo.mempool_stats.spent_txo_sum;
					setBitcoinBalance(chainBalance + mempoolBalance);
					return;
				}
				setBitcoinBalance(0);
				return;
			}
			const utxos = (await utxoResponse.json()) as Array<{
				txid: string;
				vout: number;
				value: number;
				status: { confirmed: boolean };
			}>;

			// If UTXOs are empty, try address API as it may have more accurate data
			if (utxos.length === 0) {
				const addressResponse = await fetch(`${MEMPOOL_API}/address/${address}`);
				if (addressResponse.ok) {
					const addressInfo = (await addressResponse.json()) as {
						chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
						mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
					};
					const chainBalance =
						addressInfo.chain_stats.funded_txo_sum - addressInfo.chain_stats.spent_txo_sum;
					const mempoolBalance =
						addressInfo.mempool_stats.funded_txo_sum - addressInfo.mempool_stats.spent_txo_sum;
					const totalFromAddressApi = chainBalance + mempoolBalance;
					setBitcoinBalance(totalFromAddressApi);
					return;
				}
			}

			// Include both confirmed and unconfirmed UTXOs for balance display
			const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0);
			setBitcoinBalance(totalBalance);
		} catch (error) {
			console.error('Error fetching Bitcoin balance:', error);
			setBitcoinBalance(0);
		} finally {
			setIsLoadingBtcBalance(false);
		}
	};

	// Send Bitcoin transaction using btcsnap's btc_signPsbt method
	const sendBitcoinTransaction = async (): Promise<string> => {
		if (!metamaskConfig) return '';

		const recipientAddress = metamaskConfig.bitcoinAddress;
		if (!recipientAddress) {
			message.error(t('donation.bitcoinAddressNotConfiguredAdmin'));
			return '';
		}

		// Show Bitcoin sending modal
		setShowBitcoinModal(true);
		setBitcoinSendStep(0);
		setBitcoinSendError('');

		try {
			// Step 1: Connect to Snap and get user's address
			setBitcoinSendStep(1);

			let senderAddress = bitcoinAddress;
			if (!senderAddress) {
				senderAddress = await connectBitcoinSnap();
				setBitcoinAddress(senderAddress);
			}

			// Step 2: Fetch UTXOs
			setBitcoinSendStep(2);

			const utxoResponse = await fetch(`${MEMPOOL_API}/address/${senderAddress}/utxo`);
			if (!utxoResponse.ok) {
				throw new Error(t('donation.utxoFetchFailed'));
			}
			const utxos = (await utxoResponse.json()) as Array<{
				txid: string;
				vout: number;
				value: number;
				status: { confirmed: boolean };
			}>;

			// Use all UTXOs (both confirmed and unconfirmed)
			// Note: Using unconfirmed UTXOs may cause issues if parent tx is not confirmed
			const confirmedUtxos = utxos.filter(u => u.status.confirmed);
			const unconfirmedUtxos = utxos.filter(u => !u.status.confirmed);

			// Prefer confirmed UTXOs, but fall back to all if needed
			const usableUtxos = confirmedUtxos.length > 0 ? confirmedUtxos : utxos;

			if (usableUtxos.length === 0) {
				// Refresh balance display
				await fetchBitcoinBalance(senderAddress);
				const totalUnconfirmed = unconfirmedUtxos.reduce((sum, u) => sum + u.value, 0);
				if (totalUnconfirmed > 0) {
					throw new Error(
						t('donation.noConfirmedBalance', {
							amount: (totalUnconfirmed / 100000000).toFixed(8),
						}),
					);
				}
				throw new Error(t('donation.noBalanceAtAddress', { address: senderAddress }));
			}

			// Calculate amounts (satoshi fits in a safe integer: 21M BTC = 2.1e15 < 2^53)
			const sendAmountSatoshi = Number(decimalToBigInt(cryptoAmount, 8));
			const totalBalance = usableUtxos.reduce((sum, u) => sum + u.value, 0);

			// Get fee rate
			const feeResponse = await fetch(`${MEMPOOL_API}/v1/fees/recommended`);
			const feeRates = (await feeResponse.json()) as {
				fastestFee: number;
				halfHourFee: number;
				hourFee: number;
			};
			const feeRate = feeRates.halfHourFee;

			// Estimate fee
			const estimatedVbytes = usableUtxos.length * 68 + 2 * 31 + 10;
			const estimatedFee = estimatedVbytes * feeRate;

			// Store fee for display
			setBitcoinFee(estimatedFee);

			if (totalBalance < sendAmountSatoshi + estimatedFee) {
				throw new Error(
					t('donation.insufficientBalance', {
						balance: (totalBalance / 100000000).toFixed(8),
						required: ((sendAmountSatoshi + estimatedFee) / 100000000).toFixed(8),
					}),
				);
			}

			// Step 3: Build PSBT
			setBitcoinSendStep(3);

			const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });

			// Derive pubkey from xpub for bip32Derivation
			// Use the correct address index that was found during connection
			let senderPubkey: Buffer | null = null;
			let masterFingerprint: Buffer | null = null;
			// For change addresses (index >= 100), use change path m/1/x
			// For receive addresses (index < 100), use receive path m/0/x
			const isChangeAddress = _bitcoinAddressIndex >= 100;
			const actualIndex = isChangeAddress ? _bitcoinAddressIndex - 100 : _bitcoinAddressIndex;
			const derivationPath = isChangeAddress
				? `m/84'/0'/0'/1/${actualIndex}`
				: `m/84'/0'/0'/0/${actualIndex}`;

			if (_bitcoinXpub && _bitcoinMfp) {
				try {
					const derived = deriveFromXpub(_bitcoinXpub, actualIndex, isChangeAddress ? 1 : 0);
					senderPubkey = derived.pubkey;
					masterFingerprint = Buffer.from(_bitcoinMfp, 'hex');
				} catch (e) {
					console.warn('Failed to derive pubkey for bip32Derivation:', e);
				}
			}

			// Add inputs with both nonWitnessUtxo and witnessUtxo (btcsnap validates both match)
			for (const utxo of usableUtxos) {
				const txHexResponse = await fetch(`${MEMPOOL_API}/tx/${utxo.txid}/hex`);
				const txHex = await txHexResponse.text();
				const txBuffer = Buffer.from(txHex, 'hex');
				const tx = bitcoin.Transaction.fromHex(txHex);

				const inputData: {
					hash: string;
					index: number;
					nonWitnessUtxo: Buffer;
					witnessUtxo: { script: Buffer; value: bigint };
					bip32Derivation?: Array<{
						masterFingerprint: Buffer;
						pubkey: Buffer;
						path: string;
					}>;
				} = {
					hash: utxo.txid,
					index: utxo.vout,
					nonWitnessUtxo: txBuffer,
					witnessUtxo: {
						script: Buffer.from(tx.outs[utxo.vout].script),
						value: BigInt(utxo.value),
					},
				};

				// Add bip32Derivation if we have the pubkey (required by btcsnap)
				if (senderPubkey && masterFingerprint) {
					inputData.bip32Derivation = [
						{
							masterFingerprint,
							pubkey: senderPubkey,
							path: derivationPath,
						},
					];
				}

				psbt.addInput(inputData);
			}

			// Add recipient output
			psbt.addOutput({
				address: recipientAddress,
				value: BigInt(sendAmountSatoshi),
			});

			// Add change output if needed (with bip32Derivation for btcsnap validation)
			const changeAmount = totalBalance - sendAmountSatoshi - estimatedFee;
			if (changeAmount > 546) {
				const changeOutput: {
					address: string;
					value: bigint;
					bip32Derivation?: Array<{
						masterFingerprint: Buffer;
						pubkey: Buffer;
						path: string;
					}>;
				} = {
					address: senderAddress,
					value: BigInt(changeAmount),
				};

				// Add bip32Derivation to change output for btcsnap validation
				if (senderPubkey && masterFingerprint) {
					changeOutput.bip32Derivation = [
						{
							masterFingerprint,
							pubkey: senderPubkey,
							path: derivationPath,
						},
					];
				}

				psbt.addOutput(changeOutput);
			}

			const psbtBase64 = psbt.toBase64();

			// Step 4: Sign with Snap
			setBitcoinSendStep(4);

			const signResponse = (await window.ethereum!.request({
				method: 'wallet_invokeSnap',
				params: {
					snapId: activeSnapId,
					request: {
						method: 'btc_signPsbt',
						params: {
							psbt: psbtBase64,
							network: 'main',
							scriptType: 'P2WPKH',
						},
					},
				},
			})) as { txId: string; txHex: string };

			if (!signResponse || !signResponse.txHex) {
				throw new Error(t('donation.txSignFailed'));
			}

			// Step 5: Broadcast
			setBitcoinSendStep(5);

			const broadcastResponse = await fetch(`${MEMPOOL_API}/tx`, {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: signResponse.txHex,
			});

			if (!broadcastResponse.ok) {
				const errorText = await broadcastResponse.text();
				throw new Error(t('donation.broadcastFailed', { error: errorText }));
			}

			const txid = await broadcastResponse.text();

			// Step 6: Complete
			setBitcoinSendStep(6);
			message.success(t('donation.bitcoinSendComplete', { txid: txid.substring(0, 16) }));

			// Refresh balance after sending
			setTimeout(() => {
				fetchBitcoinBalance(senderAddress);
			}, 3000);

			return txid;
		} catch (error) {
			console.error('Bitcoin send error:', error);
			const errorObj = error as { code?: number; message?: string };
			let errorMessage = t('donation.unknownErrorOccurred');

			if (errorObj.message) {
				errorMessage = errorObj.message;
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			// Check for user rejection
			if (
				errorObj.code === 4001 ||
				errorMessage.includes('reject') ||
				errorMessage.includes('キャンセル') ||
				errorMessage.toLowerCase().includes('cancel') ||
				errorMessage.includes('User rejected')
			) {
				message.info(t('donation.operationCancelled'));
				setBitcoinSendError(t('donation.cancelledByUser'));
			} else if (errorMessage.includes('Sign transaction failed')) {
				// This error occurs when the Snap cannot sign the transaction
				// Usually because the address doesn't match
				setBitcoinSendError(t('donation.txSignFailedCheckAccount'));
			} else {
				setBitcoinSendError(errorMessage);
			}

			return '';
		}
	};

	return {
		showBitcoinModal,
		setShowBitcoinModal,
		bitcoinSendStep,
		setBitcoinSendStep,
		bitcoinSendError,
		setBitcoinSendError,
		bitcoinAddress,
		setBitcoinAddress,
		_bitcoinXpub,
		setBitcoinXpub,
		_bitcoinMfp,
		setBitcoinMfp,
		_bitcoinAddressIndex,
		bitcoinBalance,
		setBitcoinBalance,
		bitcoinFee,
		setBitcoinFee,
		isLoadingBtcBalance,
		_isSnapInstalled,
		activeSnapId,
		connectBitcoinSnap,
		connectTrustWalletBitcoin,
		connectBitcoin,
		fetchBitcoinBalance,
		sendBitcoinTransaction,
	};
};
