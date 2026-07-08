// Solana wallet state and actions for the donation form: connection via
// Phantom / Trust Wallet / MetaMask Snap, balance lookup and SOL / SPL token
// transfers built with @solana/web3.js.
import { useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { base58 } from '@scure/base';
import type { PublicKey as SolanaPublicKey } from '@solana/web3.js';
import { decimalToBigInt } from '../cryptoAmount';
import {
	SOLANA_ATA_PROGRAM_ID,
	SOLANA_RPC,
	SOLANA_SNAP_ID,
	SOLANA_TOKEN_PROGRAM_ID,
} from '../constants';
import { MetamaskConfig, TokenOption } from '../types';
import { isTrustWalletConnected } from '../walletUtils';

interface UseSolanaWalletArgs {
	metamaskConfig: MetamaskConfig | null;
	cryptoAmount: string;
}

export const useSolanaWallet = ({ metamaskConfig, cryptoAmount }: UseSolanaWalletArgs) => {
	const { t } = useTranslation();

	// Solana specific state
	const [solanaAddress, setSolanaAddress] = useState<string>(''); // User's Solana address from Snap
	const [solanaBalance, setSolanaBalance] = useState<number | null>(null); // Solana balance in lamports
	const [isLoadingSolBalance, setIsLoadingSolBalance] = useState<boolean>(false);

	// Connect to Solana Snap and get user's address
	// Note: Solflare Snap has origin restrictions and may not work on all domains
	const connectSolanaSnap = async (): Promise<string> => {
		if (!window.ethereum?.request) {
			throw new Error(t('donation.metamaskNotDetected'));
		}

		// Check if Phantom or other Solana wallet is available
		if (window.solana && !window.solana.isPhantom) {
			// Use native Solana provider if available (e.g., Phantom extension)
			try {
				const response = await window.solana.connect();
				const address = response.publicKey.toString();
				fetchSolanaBalance(address);
				return address;
			} catch {
				// Fall through to Snap attempt
			}
		}

		// Check if Solana Snap is installed
		let snaps: Record<string, unknown>;
		try {
			snaps = (await window.ethereum.request({
				method: 'wallet_getSnaps',
			})) as Record<string, unknown>;
		} catch {
			throw new Error(t('donation.snapsNotSupported'));
		}

		// Install Solana Snap if not installed
		if (!snaps[SOLANA_SNAP_ID]) {
			try {
				await window.ethereum.request({
					method: 'wallet_requestSnaps',
					params: {
						[SOLANA_SNAP_ID]: {},
					},
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				// Check for origin restriction error
				if (
					errorMessage.includes('not on the allowlist') ||
					errorMessage.includes('origin') ||
					errorMessage.includes('allowlist')
				) {
					throw new Error(t('donation.solanaSnapOriginRestricted'), { cause: error });
				}
				throw new Error(t('donation.solanaSnapInstallFailed'), { cause: error });
			}
		}

		// Get Solana account
		const accountResponse = (await window.ethereum.request({
			method: 'wallet_invokeSnap',
			params: {
				snapId: SOLANA_SNAP_ID,
				request: {
					method: 'getAccount',
				},
			},
		})) as { publicKey: string } | string;

		let address: string;
		if (typeof accountResponse === 'string') {
			address = accountResponse;
		} else if (accountResponse && accountResponse.publicKey) {
			address = accountResponse.publicKey;
		} else {
			throw new Error(t('donation.solanaAccountFailed'));
		}

		// Fetch balance after connecting
		fetchSolanaBalance(address);

		return address;
	};

	// Connect to Trust Wallet Solana
	const connectTrustWalletSolana = async (): Promise<string> => {
		// Try to get Solana provider from Trust Wallet
		const solanaProvider = window.trustwallet?.solana || window.solana;

		if (!solanaProvider) {
			throw new Error(t('donation.trustWalletSolanaNotDetected'));
		}

		try {
			const response = await solanaProvider.connect();
			const address = response.publicKey.toString();

			// Fetch balance after connecting
			fetchSolanaBalance(address);

			return address;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : t('donation.unknownError');
			if (errorMessage.includes('reject') || errorMessage.includes('cancel')) {
				throw new Error(t('donation.connectionCancelled'), { cause: error });
			}
			throw new Error(t('donation.solanaConnectError', { error: errorMessage }), { cause: error });
		}
	};

	// Universal Solana connect function (Phantom, Trust Wallet, or MetaMask Snap)
	const connectSolana = async (): Promise<string> => {
		// Priority 1: Phantom wallet (most reliable for Solana)
		if (window.solana?.isPhantom) {
			try {
				const response = await window.solana.connect();
				const address = response.publicKey.toString();
				fetchSolanaBalance(address);
				return address;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : t('donation.unknownError');
				if (errorMessage.includes('reject') || errorMessage.includes('cancel')) {
					throw new Error(t('donation.connectionCancelled'), { cause: error });
				}
				throw new Error(t('donation.phantomConnectError', { error: errorMessage }), { cause: error });
			}
		}

		// Priority 2: Trust Wallet
		if (isTrustWalletConnected()) {
			return connectTrustWalletSolana();
		}

		// Priority 3: Other Solana wallets (Solflare, etc.)
		if (window.solana) {
			try {
				const response = await window.solana.connect();
				const address = response.publicKey.toString();
				fetchSolanaBalance(address);
				return address;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : t('donation.unknownError');
				if (errorMessage.includes('reject') || errorMessage.includes('cancel')) {
					throw new Error(t('donation.connectionCancelled'), { cause: error });
				}
				// Fall through to MetaMask Snap
			}
		}

		// Priority 4: MetaMask Snap (may have origin restrictions)
		return connectSolanaSnap();
	};

	// Fetch Solana balance from RPC
	const fetchSolanaBalance = async (address: string) => {
		if (!address) return;

		setIsLoadingSolBalance(true);
		try {
			const response = await fetch(SOLANA_RPC, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'getBalance',
					params: [address],
				}),
			});

			const data = (await response.json()) as {
				result?: { value: number };
				error?: { message: string };
			};
			if (data.result) {
				setSolanaBalance(data.result.value);
			} else {
				console.error('Failed to fetch Solana balance:', data.error);
				setSolanaBalance(0);
			}
		} catch (error) {
			console.error('Error fetching Solana balance:', error);
			setSolanaBalance(0);
		} finally {
			setIsLoadingSolBalance(false);
		}
	};

	// Send Solana transaction (native SOL or SPL token) via Phantom, Trust Wallet, or MetaMask Snap
	// The selected token is passed in from the component (it is owned by the EVM
	// wallet hook, so it cannot be a hook argument without a circular dependency).
	const sendSolanaTransaction = async (selectedToken: TokenOption | null): Promise<string> => {
		if (!metamaskConfig || !selectedToken) return '';

		const recipientAddress = metamaskConfig.walletAddress;
		if (!recipientAddress) {
			message.error(t('donation.solanaAddressNotConfiguredAdmin'));
			return '';
		}

		try {
			// Get sender address if not connected
			let senderAddress = solanaAddress;
			if (!senderAddress) {
				senderAddress = await connectSolana();
				setSolanaAddress(senderAddress);
			}

			// Build a real Transaction with @solana/web3.js (loaded lazily to keep
			// the initial bundle small)
			const web3 = await import('@solana/web3.js');
			const connection = new web3.Connection(SOLANA_RPC, 'confirmed');
			const fromPubkey = new web3.PublicKey(senderAddress);
			const toPubkey = new web3.PublicKey(recipientAddress);
			const transaction = new web3.Transaction();

			if (selectedToken.address) {
				// SPL token transfer (USDC/USDT): amounts use the mint's decimals, not lamports
				const tokenAmount = decimalToBigInt(cryptoAmount, selectedToken.decimals);
				if (tokenAmount <= 0n) {
					throw new Error(t('donation.amountTooSmall'));
				}
				const mint = new web3.PublicKey(selectedToken.address);
				const tokenProgramId = new web3.PublicKey(SOLANA_TOKEN_PROGRAM_ID);
				const ataProgramId = new web3.PublicKey(SOLANA_ATA_PROGRAM_ID);
				const deriveAta = (owner: SolanaPublicKey) =>
					web3.PublicKey.findProgramAddressSync(
						[owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
						ataProgramId,
					)[0];
				const sourceAta = deriveAta(fromPubkey);
				const destAta = deriveAta(toPubkey);

				// Create the recipient's associated token account if it doesn't exist
				// (the sender pays the rent)
				const destInfo = await connection.getAccountInfo(destAta);
				if (!destInfo) {
					transaction.add(
						new web3.TransactionInstruction({
							programId: ataProgramId,
							keys: [
								{ pubkey: fromPubkey, isSigner: true, isWritable: true },
								{ pubkey: destAta, isSigner: false, isWritable: true },
								{ pubkey: toPubkey, isSigner: false, isWritable: false },
								{ pubkey: mint, isSigner: false, isWritable: false },
								{ pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
								{ pubkey: tokenProgramId, isSigner: false, isWritable: false },
							],
							data: Buffer.alloc(0),
						}),
					);
				}

				// SPL Token "Transfer" instruction: tag 3 + u64 amount (little endian)
				const data = Buffer.alloc(9);
				data.writeUInt8(3, 0);
				data.writeBigUInt64LE(tokenAmount, 1);
				transaction.add(
					new web3.TransactionInstruction({
						programId: tokenProgramId,
						keys: [
							{ pubkey: sourceAta, isSigner: false, isWritable: true },
							{ pubkey: destAta, isSigner: false, isWritable: true },
							{ pubkey: fromPubkey, isSigner: true, isWritable: false },
						],
						data,
					}),
				);
			} else {
				// Native SOL transfer (1 SOL = 1e9 lamports)
				const lamports = decimalToBigInt(cryptoAmount, 9);
				if (lamports <= 0n) {
					throw new Error(t('donation.amountTooSmall'));
				}
				transaction.add(web3.SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
			}

			const { blockhash } = await connection.getLatestBlockhash();
			transaction.recentBlockhash = blockhash;
			transaction.feePayer = fromPubkey;

			// Sign and send with the same provider priority as connectSolana()
			const provider = window.solana?.isPhantom
				? window.solana
				: window.trustwallet?.solana || window.solana;

			let signature: string;
			if (provider?.signAndSendTransaction) {
				const result = (await provider.signAndSendTransaction(transaction)) as {
					signature: string;
				};
				signature = result.signature;
			} else if (provider?.signTransaction) {
				const signed = (await provider.signTransaction(transaction)) as {
					serialize: () => Uint8Array;
				};
				signature = await connection.sendRawTransaction(Buffer.from(signed.serialize()));
			} else if (window.ethereum) {
				// MetaMask Snap: expects the base58-encoded serialized transaction message
				const serializedMessage = base58.encode(transaction.serializeMessage());
				const result = (await window.ethereum.request({
					method: 'wallet_invokeSnap',
					params: {
						snapId: SOLANA_SNAP_ID,
						request: {
							method: 'signAndSendTransaction',
							params: { transaction: serializedMessage },
						},
					},
				})) as { signature: string } | string;

				if (typeof result === 'string') {
					signature = result;
				} else if (result && result.signature) {
					signature = result.signature;
				} else {
					throw new Error(t('donation.txSendFailed'));
				}
			} else {
				throw new Error(t('donation.solanaWalletNotFound'));
			}

			message.success(t('donation.solanaSendComplete', { signature: signature.substring(0, 16) }));
			return signature;
		} catch (error) {
			console.error('Solana send error:', error);
			const errorMessage =
				error instanceof Error ? error.message : t('donation.unknownErrorOccurred');

			if (
				errorMessage.includes('reject') ||
				errorMessage.includes('キャンセル') ||
				errorMessage.toLowerCase().includes('cancel') ||
				errorMessage.includes('User rejected')
			) {
				message.info(t('donation.operationCancelled'));
			} else {
				message.error(t('donation.solanaSendError', { error: errorMessage }));
			}

			return '';
		}
	};

	return {
		solanaAddress,
		setSolanaAddress,
		solanaBalance,
		setSolanaBalance,
		isLoadingSolBalance,
		connectSolanaSnap,
		connectTrustWalletSolana,
		connectSolana,
		fetchSolanaBalance,
		sendSolanaTransaction,
	};
};
