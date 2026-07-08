/**
 * Bouyomi-chan (text-to-speech) integration page
 *
 * NOTE: This is an intentional standalone, Japanese-only operator tool for
 * OBS / local capture. It deliberately does not follow the site design
 * system or i18n — do not restyle it.
 *
 * Usage:
 * 1. Start Bouyomi-chan (turn on its HTTP integration)
 * 2. Open http://localhost:8080/embed/chat/bouyomi in a browser
 * 3. Comments posted to the AoiTube chat are read aloud automatically
 *
 * Bouyomi-chan settings:
 * - Enable Others -> Settings -> Integration -> HTTP integration
 * - The default port number is 50080
 *
 * URL parameters:
 * - host: Bouyomi-chan host (default: localhost)
 *         For WSL2, specify $(hostname).local or the Windows IP
 * - port: Bouyomi-chan port number (default: 50080)
 * - speed: reading speed -1 to 200 (default: -1 = follow Bouyomi-chan's settings)
 * - tone: voice pitch -1 to 200 (default: -1)
 * - volume: volume -1 to 100 (default: -1)
 * - voice: voice type 0 to 8 (default: 0)
 *
 * Example: /embed/chat/bouyomi?host=192.168.1.100&port=50080&speed=100
 */
import { useEffect, useRef, useState } from 'react';
import Head from '@components/compat/Head';
import {
	isScreenEffectType,
	SCREEN_EFFECT_NAMES_JA,
} from '../../../../interfaces/donation.model';

const CHAT_MESSAGES_URL = '/api/chat/messages';
const DONATIONS_RECENT_URL = '/api/donations/recent?limit=20';
const POLL_INTERVAL = 1500;

interface BouyomiConfig {
	host: string;
	port: number;
	speed: number;
	tone: number;
	volume: number;
	voice: number;
}

interface LogEntry {
	id: string;
	time: string;
	name: string;
	message: string;
	status: 'pending' | 'success' | 'error';
	type?: 'chat' | 'donation';
}

export default function BouyomiPage() {
	const [config, setConfig] = useState<BouyomiConfig>({
		host: 'localhost',
		port: 50080,
		speed: -1,
		tone: -1,
		volume: -1,
		voice: 0,
	});
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [status, setStatus] = useState<string>('初期化中...');
	const processedIds = useRef<Set<string>>(new Set());
	const isInitialized = useRef<boolean>(false);
	const donationInitialized = useRef<boolean>(false);

	// Format a donation amount for reading aloud
	const formatDonationForBouyomi = (amount: number, currency: string): string => {
		// Crypto amounts are stored multiplied by 1e8
		const normalizedCurrency = currency?.toUpperCase() || '';
		const cryptoCurrencies = ['BTC', 'ETH', 'MATIC', 'BNB', 'AVAX', 'VBC', 'USDT', 'USDC', 'DAI'];

		if (cryptoCurrencies.includes(normalizedCurrency)) {
			const cryptoAmount = amount / 100000000;
			// Format with an appropriate number of digits for reading aloud
			if (cryptoAmount === 0) {
				return `0 ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 0.0001) {
				return `${cryptoAmount.toFixed(8)} ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 0.01) {
				return `${cryptoAmount.toFixed(6)} ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 1) {
				return `${cryptoAmount.toFixed(4)} ${normalizedCurrency}`;
			} else {
				return `${cryptoAmount.toFixed(2)} ${normalizedCurrency}`;
			}
		}
		// Fiat currencies
		if (normalizedCurrency === 'JPY') {
			return `${amount}円`;
		}
		if (normalizedCurrency === 'USD') {
			return `${(amount / 100).toFixed(2)}ドル`;
		}
		return `${amount} ${currency}`;
	};

	// Load settings from the URL parameters
	useEffect(() => {
		if (typeof window === 'undefined') return;

		const params = new URLSearchParams(window.location.search);
		setConfig({
			host: params.get('host') || 'localhost',
			port: parseInt(params.get('port') || '50080', 10),
			speed: parseInt(params.get('speed') || '-1', 10),
			tone: parseInt(params.get('tone') || '-1', 10),
			volume: parseInt(params.get('volume') || '-1', 10),
			voice: parseInt(params.get('voice') || '0', 10),
		});
	}, []);

	// Send to Bouyomi-chan
	const sendToBouyomi = async (name: string, message: string, id: string) => {
		// Skip empty messages
		if (!message || message.trim() === '') {
			setLogs(prev => {
				const updated = prev.map(log =>
					log.id === id ? { ...log, status: 'success' as const } : log,
				);
				return updated.slice(-50);
			});
			return;
		}

		// An empty name means the message is already a complete sentence
		// (e.g. screen effect purchases: "〇〇さんが花火を贈りました").
		const text = name ? `${name}さん、${message}` : message;

		// Direct mode: send to Bouyomi-chan straight from the browser (when the browser runs on Windows)
		// Server mode: send via the AoiTube server (from Linux/WSL2 to Bouyomi-chan on Windows)
		const isDirect = config.host === 'localhost' || config.host === '127.0.0.1';

		if (isDirect) {
			// Direct mode (no-cors because of CORS restrictions)
			const directUrl = `http://localhost:${config.port}/Talk?text=${encodeURIComponent(text)}&speed=${config.speed}&tone=${config.tone}&volume=${config.volume}&voice=${config.voice}`;
			console.log('Sending directly to bouyomi:', directUrl);

			try {
				await fetch(directUrl, { mode: 'no-cors' });
				// The response cannot be read with no-cors, so assume success
				setLogs(prev => {
					const updated = prev.map(log =>
						log.id === id ? { ...log, status: 'success' as const } : log,
					);
					return updated.slice(-50);
				});
			} catch (error) {
				console.error('Bouyomi direct error:', error);
				setLogs(prev => {
					const updated = prev.map(log =>
						log.id === id ? { ...log, status: 'error' as const } : log,
					);
					return updated.slice(-50);
				});
			}
		} else {
			// Server-relayed mode
			const url = `/api/integrations/bouyomi?text=${encodeURIComponent(text)}&host=${encodeURIComponent(config.host)}&port=${config.port}&speed=${config.speed}&tone=${config.tone}&volume=${config.volume}&voice=${config.voice}`;
			console.log('Sending via server to bouyomi:', url);

			try {
				const response = await fetch(url);
				const result = await response.json();
				console.log('Bouyomi response:', result);

				setLogs(prev => {
					const updated = prev.map(log =>
						log.id === id
							? { ...log, status: (result.success ? 'success' : 'error') as 'success' | 'error' }
							: log,
					);
					return updated.slice(-50);
				});
			} catch (error) {
				console.error('Bouyomi server error:', error);
				setLogs(prev => {
					const updated = prev.map(log =>
						log.id === id ? { ...log, status: 'error' as const } : log,
					);
					return updated.slice(-50);
				});
			}
		}
	};

	// Fetch chat messages by polling
	useEffect(() => {
		let mounted = true;

		const fetchMessages = async () => {
			try {
				const response = await fetch(CHAT_MESSAGES_URL);
				if (!response.ok || !mounted) return;

				const data = await response.json();
				if (data.comments && Array.isArray(data.comments)) {
					const isFirstFetch = !isInitialized.current;

					for (const msg of data.comments) {
						if (processedIds.current.has(msg.id)) continue;
						processedIds.current.add(msg.id);

						// On the first fetch, skip existing comments (just record their IDs)
						if (isFirstFetch) continue;

						const name = msg.name || '名無し';
						const message = msg.comment || '';
						const time = new Date().toLocaleTimeString('ja-JP', {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						});

						// Add to the log
						const newLog: LogEntry = {
							id: msg.id,
							time,
							name,
							message,
							status: 'pending',
							type: 'chat',
						};
						setLogs(prev => [...prev, newLog].slice(-50));

						// Send to Bouyomi-chan
						sendToBouyomi(name, message, msg.id);
					}

					isInitialized.current = true;
					setStatus('接続中 - 新しいコメント/スーパーチャットを待機中...');
				}
			} catch (_error) {
				setStatus('エラー: APIに接続できません');
			}
		};

		// Fetch donations
		const fetchDonations = async () => {
			try {
				const response = await fetch(DONATIONS_RECENT_URL);
				if (!response.ok || !mounted) return;

				const donations = await response.json();
				console.log('Donations fetched:', donations);
				if (Array.isArray(donations)) {
					const isFirstFetch = !donationInitialized.current;
					console.log('Is first fetch:', isFirstFetch, 'donations count:', donations.length);

					for (const donation of donations) {
						const donationId = `donation-${donation.id}`;
						if (processedIds.current.has(donationId)) continue;
						processedIds.current.add(donationId);

						console.log('Processing donation:', donationId, 'isFirstFetch:', isFirstFetch);

						// On the first fetch, skip existing donations (just record their IDs)
						if (isFirstFetch) continue;

						const name = donation.displayName || '匿名';
						const isEffect = donation.itemType === 'effect';
						let text: string;
						if (isEffect) {
							// Screen effect purchases are read as "〇〇さんが花火を贈りました";
							// the amount and message are only read for superchats
							// (effects are fixed-price and never carry a message).
							const effectName = isScreenEffectType(donation.effectType)
								? SCREEN_EFFECT_NAMES_JA[donation.effectType]
								: '画面演出';
							text = `${effectName}を贈りました`;
						} else {
							const amount = formatDonationForBouyomi(donation.amount, donation.currency);
							const message = donation.message || '';
							text = message
								? `${amount}のスーパーチャット、${message}`
								: `${amount}のスーパーチャット`;
						}
						const time = new Date().toLocaleTimeString('ja-JP', {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						});

						// Add to the log
						const newLog: LogEntry = {
							id: donationId,
							time,
							name,
							message: text,
							status: 'pending',
							type: 'donation',
						};
						setLogs(prev => [...prev, newLog].slice(-50));

						// Send to Bouyomi-chan. Effects pass a complete sentence so the
						// reading is "〇〇さんが〜" instead of the "〇〇さん、〜" prefix.
						if (isEffect) {
							sendToBouyomi('', `${name}さんが${text}`, donationId);
						} else {
							sendToBouyomi(name, text, donationId);
						}
					}

					donationInitialized.current = true;
				}
			} catch (_error) {
				// Ignore when the donations API is unavailable
			}
		};

		fetchMessages();
		fetchDonations();
		const interval = setInterval(() => {
			fetchMessages();
			fetchDonations();
		}, POLL_INTERVAL);

		return () => {
			mounted = false;
			clearInterval(interval);
		};
	}, [config]);

	return (
		<>
			<Head>
				<title>AoiTube 棒読みちゃん連携</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<style
				 
				dangerouslySetInnerHTML={{
					__html: `
				* {
					margin: 0;
					padding: 0;
					box-sizing: border-box;
				}
				body {
					font-family: 'Yu Gothic UI', 'Meiryo UI', sans-serif;
					background: #1a1a2e;
					color: #eee;
					padding: 20px;
				}
				h1 {
					font-size: 18px;
					margin-bottom: 10px;
					color: #4fc3f7;
				}
				.status {
					background: #16213e;
					padding: 10px 15px;
					border-radius: 8px;
					margin-bottom: 15px;
					font-size: 14px;
				}
				.config {
					background: #16213e;
					padding: 15px;
					border-radius: 8px;
					margin-bottom: 15px;
					font-size: 12px;
				}
				.config-item {
					display: inline-block;
					margin-right: 15px;
					color: #888;
				}
				.log-container {
					background: #0f0f23;
					border-radius: 8px;
					padding: 10px;
					max-height: 400px;
					overflow-y: auto;
				}
				.log-entry {
					padding: 8px 10px;
					margin: 4px 0;
					background: #16213e;
					border-radius: 6px;
					font-size: 13px;
					display: flex;
					align-items: center;
					gap: 10px;
				}
				.log-entry.donation {
					background: #2e3a1e;
					border-left: 3px solid #ffa726;
				}
				.log-icon {
					flex-shrink: 0;
				}
				.log-time {
					color: #666;
					font-size: 11px;
					flex-shrink: 0;
				}
				.log-name {
					color: #4fc3f7;
					font-weight: bold;
					flex-shrink: 0;
				}
				.log-message {
					flex: 1;
					word-break: break-word;
				}
				.log-status {
					flex-shrink: 0;
					font-size: 11px;
					padding: 2px 6px;
					border-radius: 4px;
				}
				.log-status.pending {
					background: #ffa726;
					color: #000;
				}
				.log-status.success {
					background: #66bb6a;
					color: #000;
				}
				.log-status.error {
					background: #ef5350;
					color: #fff;
				}
				.empty {
					text-align: center;
					color: #666;
					padding: 20px;
				}
				.note {
					margin-top: 15px;
					padding: 10px;
					background: #1e3a5f;
					border-radius: 8px;
					font-size: 12px;
					color: #aaa;
				}
			`,
				}}
			/>

			<h1>🔊 AoiTube 棒読みちゃん連携</h1>

			<div className="status">状態: {status}</div>

			<div className="config">
				<span className="config-item">ホスト: {config.host}</span>
				<span className="config-item">ポート: {config.port}</span>
				<span className="config-item">速度: {config.speed}</span>
				<span className="config-item">高さ: {config.tone}</span>
				<span className="config-item">音量: {config.volume}</span>
				<span className="config-item">声質: {config.voice}</span>
			</div>

			<div className="log-container">
				{logs.length === 0 ? (
					<div className="empty">
						新しいコメントを待機中...
						<br />
						このページを開いた後に投稿されたコメント・スーパーチャットが読み上げられます
					</div>
				) : (
					logs
						.slice()
						.reverse()
						.map(log => (
							<div
								key={log.id}
								className={`log-entry ${log.type === 'donation' ? 'donation' : ''}`}
							>
								<span className="log-time">{log.time}</span>
								{log.type === 'donation' && <span className="log-icon">💰</span>}
								<span className="log-name">{log.name}</span>
								<span className="log-message">{log.message}</span>
								<span className={`log-status ${log.status}`}>
									{log.status === 'pending'
										? '送信中'
										: log.status === 'success'
											? '完了'
											: 'エラー'}
								</span>
							</div>
						))
				)}
			</div>

			<div className="note">
				💡 ヒント: 棒読みちゃんの「その他→設定→連携→HTTP連携」を有効にしてください。
				<br />
				WSL2の場合は host パラメータにWindowsのIPを指定してください。
				<br />
				例: ?host=192.168.1.100&port=50080&speed=100&voice=1
			</div>
		</>
	);
}
