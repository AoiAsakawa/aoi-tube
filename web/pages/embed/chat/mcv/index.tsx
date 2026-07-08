/**
 * Comment generator page for OneComme / multi comment viewers
 *
 * Setup in OneComme:
 * 1. Start OneComme
 * 2. Select "Connect" -> "Custom"
 * 3. Enter http://localhost:8080/embed/chat/mcv as the URL
 * 4. Click "Connect"
 *
 * Selector settings (if not auto-detected):
 * - Comment element: .comment
 * - Username: .name
 * - Comment body: .message
 * - Time: .time
 *
 * No-auth version: fetches chat via polling
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import Head from '@components/compat/Head';
import {
	formatDonationAmount,
	getScreenEffectEmoji,
	getSuperchatTier,
	isHighValueDonation,
	isSuperHighValueDonation,
	SuperchatTier,
} from '@/interfaces/donation.model';

const CHAT_MESSAGES_URL = '/api/chat/messages';
const DONATIONS_RECENT_URL = '/api/donations/recent?limit=20';
const POLL_INTERVAL = 1500; // Poll every 1.5 seconds

// The server scopes chat history to the current stream session, so after a
// stream ends the history API turns empty. Once it has stayed empty this many
// consecutive polls (~90s — outlives encoder blips), drop the locally
// accumulated comments so a 24/7 OBS overlay doesn't show them forever.
const EMPTY_HISTORY_POLLS_BEFORE_CLEAR = 60;

// Japanese effect names for the standalone (no-i18n) overlay, matching the
// screenEffects.* catalog entries used by the main chat panel.
const EFFECT_NAMES_JA: Record<string, string> = {
	confetti: '紙吹雪',
	hearts: 'ハート',
	stars: '流れ星',
	fireworks: '花火',
	celebration: 'お祝い',
	rainbow: '虹',
	meteor: '流星群',
	goldrush: 'ゴールドラッシュ',
};

interface Comment {
	id: string;
	name: string;
	message: string;
	timestamp: string;
	rawTimestamp: number; // Timestamp used for sorting
	profileImage?: string;
	isDonation?: boolean;
	donationAmount?: string;
	isSuperHighValue?: boolean;
	isHighValue?: boolean;
	// Amount-tier colors shared with the main chat panel (fiat superchats).
	tier?: SuperchatTier;
	// Screen effect purchases render as a single line, not a donation card.
	isEffect?: boolean;
}

export default function CommentGenerator() {
	const [comments, setComments] = useState<Comment[]>([]);
	const processedIds = useRef<Set<string>>(new Set());
	const emptyHistoryPolls = useRef(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// Strip HTML tags
	const stripHtml = useCallback((html: string): string => {
		if (typeof document === 'undefined') return html;
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		return tmp.textContent || tmp.innerText || '';
	}, []);

	// Process a message (only new IDs are handled)
	const processMessage = useCallback(
		(data: any): Comment | null => {
			// Skip IDs that have already been processed
			if (processedIds.current.has(data.id)) {
				return null;
			}

			processedIds.current.add(data.id);

			const msgTime = new Date(data.timestamp).getTime();
			return {
				id: data.id,
				name: data.name || '名無し',
				message: stripHtml(data.comment || ''),
				timestamp: new Date(data.timestamp).toLocaleTimeString('ja-JP', {
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
				}),
				rawTimestamp: msgTime,
				profileImage: data.profileImage || undefined,
			};
		},
		[stripHtml],
	);

	// Fetch chat messages by polling
	useEffect(() => {
		let mounted = true;

		const fetchMessages = async () => {
			try {
				const response = await fetch(CHAT_MESSAGES_URL);
				if (!response.ok || !mounted) return;

				const data = await response.json();
				if (data.comments && Array.isArray(data.comments)) {
					if (data.comments.length === 0) {
						// Only treat an empty history as "stream ended" while the
						// stream is confirmed offline — a quiet live stream (no chat,
						// donation cards only) must not wipe the overlay.
						let online = false;
						try {
							const statusRes = await fetch('/api/status');
							online = statusRes.ok && (await statusRes.json()).online === true;
						} catch (_error) {
							online = false;
						}
						if (online) {
							emptyHistoryPolls.current = 0;
							return;
						}
						emptyHistoryPolls.current += 1;
						if (emptyHistoryPolls.current >= EMPTY_HISTORY_POLLS_BEFORE_CLEAR) {
							// Keep processedIds: recent donations would otherwise be
							// re-added by the donations poll right after the clear.
							setComments(prev => (prev.length ? [] : prev));
						}
						return;
					}
					emptyHistoryPolls.current = 0;

					const newComments: Comment[] = [];

					data.comments.forEach((msg: any) => {
						const comment = processMessage(msg);
						if (comment) {
							newComments.push(comment);
						}
					});

					if (newComments.length > 0) {
						setComments(prev => {
							// Add the new comments and sort chronologically (newest first)
							const updated = [...prev, ...newComments]
								.sort((a, b) => b.rawTimestamp - a.rawTimestamp)
								.slice(0, 200);
							return updated;
						});
					}
				}
			} catch (_error) {
				// Ignore errors and wait for the next poll
			}
		};

		// Fetch donations
		const fetchDonations = async () => {
			try {
				const response = await fetch(DONATIONS_RECENT_URL);
				if (!response.ok || !mounted) return;

				const donations = await response.json();
				if (Array.isArray(donations)) {
					const newComments: Comment[] = [];

					donations.forEach((donation: any) => {
						const donationId = `donation-${donation.id}`;
						if (processedIds.current.has(donationId)) return;
						processedIds.current.add(donationId);

						const donationTime = new Date(donation.createdAt).getTime();
						const displayTime = new Date(donation.createdAt).toLocaleTimeString('ja-JP', {
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						});
						const name = donation.isAnonymous ? '匿名' : donation.displayName || '匿名';

						// Screen effect purchases render as a single celebratory line,
						// matching the main chat panel.
						if (donation.itemType === 'effect') {
							const effectName =
								EFFECT_NAMES_JA[donation.effectType] || donation.effectType || '演出';
							newComments.push({
								id: donationId,
								name,
								message: `${getScreenEffectEmoji(donation.effectType)} ${name}さんが${effectName}を贈りました`,
								timestamp: displayTime,
								rawTimestamp: donationTime,
								isEffect: true,
							});
							return;
						}

						// Same tier resolution as the main chat panel: fiat superchats
						// use their own currency, crypto with a recorded JPY conversion
						// uses the JPY tiers, crypto without one keeps the gold styling.
						const nativeTier = getSuperchatTier(donation.amount, donation.currency);
						const hasJpyConversion =
							!nativeTier && typeof donation.amountJpy === 'number' && donation.amountJpy > 0;
						const tier =
							nativeTier ??
							(hasJpyConversion ? getSuperchatTier(donation.amountJpy, 'JPY') : null) ??
							undefined;
						const amount = hasJpyConversion
							? `${formatDonationAmount(donation.amountJpy, 'JPY')}（${formatDonationAmount(donation.amount, donation.currency)}）`
							: formatDonationAmount(donation.amount, donation.currency);
						const superHigh =
							!tier && isSuperHighValueDonation(donation.amount, donation.currency);
						const highValue = !tier && isHighValueDonation(donation.amount, donation.currency);
						newComments.push({
							id: donationId,
							name,
							message: donation.message || '',
							timestamp: displayTime,
							rawTimestamp: donationTime,
							isDonation: true,
							donationAmount: amount,
							isSuperHighValue: superHigh,
							isHighValue: highValue,
							tier,
						});
					});

					if (newComments.length > 0) {
						setComments(prev => {
							// Add the new donations and sort chronologically (newest first)
							const updated = [...prev, ...newComments]
								.sort((a, b) => b.rawTimestamp - a.rawTimestamp)
								.slice(0, 200);
							return updated;
						});
					}
				}
			} catch (_error) {
				// Ignore when the donations API is unavailable
			}
		};

		// Initial fetch
		fetchMessages();
		fetchDonations();

		// Periodic polling
		const interval = setInterval(() => {
			fetchMessages();
			fetchDonations();
		}, POLL_INTERVAL);

		return () => {
			mounted = false;
			clearInterval(interval);
		};
	}, [processMessage]);

	// Auto-scroll (new comments appear at the top, so the scroll position is 0)
	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = 0;
		}
	}, [comments]);

	return (
		<>
			<Head>
				<title>AoiTube Comments</title>
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
				html,
				body {
					background: transparent !important;
					font-family: 'Yu Gothic UI', 'Meiryo UI', 'MS Gothic', sans-serif;
					font-size: 14px;
					overflow: hidden;
				}
				#root {
					background: transparent !important;
				}
				#comment-container {
					display: flex;
					flex-direction: column;
					height: 100vh;
					overflow-y: auto;
					padding: 4px;
					/* OBS browser sources render the scrollbar; hide it while keeping
					   programmatic scrolling (auto-scroll sets scrollTop). */
					scrollbar-width: none;
				}
				#comment-container::-webkit-scrollbar {
					display: none;
				}
				.comment {
					display: flex;
					align-items: flex-start;
					padding: 6px 10px;
					margin: 2px 0;
					background: rgba(0, 0, 0, 0.6);
					border-radius: 6px;
					color: white;
					animation: fadeIn 0.3s ease;
				}
				.comment.donation {
					background: linear-gradient(
						135deg,
						rgba(255, 193, 7, 0.4) 0%,
						rgba(255, 87, 34, 0.4) 100%
					);
					border: 2px solid #ffc107;
					border-radius: 8px;
					padding: 10px 12px;
					margin: 6px 0;
					box-shadow:
						0 0 15px rgba(255, 193, 7, 0.5),
						inset 0 0 20px rgba(255, 255, 255, 0.1);
					animation:
						donationPulse 2s ease-in-out infinite,
						donationSlideIn 0.5s ease;
				}
				.comment.donation.high-value {
					background: linear-gradient(
						135deg,
						rgba(255, 107, 107, 0.5) 0%,
						rgba(255, 215, 0, 0.5) 50%,
						rgba(255, 107, 107, 0.5) 100%
					);
					background-size: 200% 200%;
					border: 2px solid #ffd700;
					animation:
						highValueGradient 3s ease infinite,
						donationSlideIn 0.5s ease;
				}
				.comment.donation.super-high-value {
					background: linear-gradient(
						135deg,
						rgba(220, 20, 60, 0.7) 0%,
						rgba(255, 69, 0, 0.7) 25%,
						rgba(255, 0, 0, 0.7) 50%,
						rgba(255, 69, 0, 0.7) 75%,
						rgba(220, 20, 60, 0.7) 100%
					);
					background-size: 300% 300%;
					border: 3px solid #ffd700;
					box-shadow:
						0 0 30px rgba(220, 20, 60, 0.8),
						0 0 60px rgba(255, 0, 0, 0.4),
						inset 0 0 30px rgba(255, 255, 255, 0.15);
					animation:
						superHighValueGradient 2s ease infinite,
						donationSlideIn 0.5s ease;
				}
				/* Tiered (fiat) superchats: the shared amount-tier colors come in via
				   inline styles, so neutralize the gold gradient chrome and the
				   gradient-text name that .comment.donation would otherwise apply. */
				.comment.donation.tiered {
					animation: donationSlideIn 0.5s ease;
					box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
				}
				.comment.donation.tiered .name {
					background: none;
					-webkit-background-clip: initial;
					background-clip: initial;
					-webkit-text-fill-color: currentColor;
					filter: none;
					font-size: 15px;
				}
				/* Screen effect purchases: a single celebratory line. */
				.comment.effect-line {
					border-left: 3px solid #ffc107;
				}
				.comment.effect-line .message {
					font-size: 14px;
				}
				@keyframes highValueGradient {
					0%,
					100% {
						background-position: 0% 50%;
					}
					50% {
						background-position: 100% 50%;
					}
				}
				@keyframes superHighValueGradient {
					0%,
					100% {
						background-position: 0% 50%;
					}
					50% {
						background-position: 100% 50%;
					}
				}
				.donation-badge {
					background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
					color: #000;
					padding: 3px 10px;
					border-radius: 12px;
					font-size: 13px;
					font-weight: bold;
					flex-shrink: 0;
					box-shadow: 0 2px 8px rgba(255, 193, 7, 0.6);
					text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
					animation: badgeShine 3s ease-in-out infinite;
				}
				.super-high-value .donation-badge {
					background: linear-gradient(135deg, #ffd700 0%, #ffec8b 50%, #ffd700 100%);
					background-size: 200% 100%;
					font-size: 15px;
					padding: 4px 14px;
					box-shadow:
						0 2px 12px rgba(255, 215, 0, 0.8),
						0 0 20px rgba(255, 215, 0, 0.4);
					animation: superBadgeShine 1.5s ease-in-out infinite;
				}
				@keyframes superBadgeShine {
					0%,
					100% {
						filter: brightness(1);
						transform: scale(1);
					}
					50% {
						filter: brightness(1.3);
						transform: scale(1.05);
					}
				}
				@keyframes donationPulse {
					0%,
					100% {
						box-shadow:
							0 0 15px rgba(255, 193, 7, 0.5),
							inset 0 0 20px rgba(255, 255, 255, 0.1);
					}
					50% {
						box-shadow:
							0 0 25px rgba(255, 193, 7, 0.8),
							inset 0 0 30px rgba(255, 255, 255, 0.15);
					}
				}
				@keyframes donationSlideIn {
					from {
						opacity: 0;
						transform: translateX(-30px) scale(0.9);
					}
					to {
						opacity: 1;
						transform: translateX(0) scale(1);
					}
				}
				@keyframes badgeShine {
					0%,
					100% {
						filter: brightness(1);
					}
					50% {
						filter: brightness(1.2);
					}
				}
				@keyframes fadeIn {
					from {
						opacity: 0;
						transform: translateY(10px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				.comment-content {
					flex: 1;
					min-width: 0;
				}
				.comment-header {
					display: flex;
					align-items: center;
					gap: 6px;
					margin-bottom: 2px;
				}
				.time {
					font-size: 11px;
					color: #999;
					flex-shrink: 0;
				}
				.name {
					font-weight: bold;
					color: #4fc3f7;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
				.comment.donation .name {
					color: #fff;
					background: linear-gradient(90deg, #ff6b6b, #feca57);
					-webkit-background-clip: text;
					background-clip: text;
					-webkit-text-fill-color: transparent;
					font-size: 15px;
					text-shadow: none;
					filter: drop-shadow(0 0 3px rgba(255, 202, 87, 0.8));
				}
				.donation-name-label {
					color: rgba(255, 255, 255, 0.7);
					font-size: 11px;
					font-style: italic;
					margin-left: 4px;
				}
				.message {
					color: #fff;
					word-wrap: break-word;
					line-height: 1.4;
				}
				.comment.donation .message {
					font-size: 15px;
					font-weight: 500;
				}
				.service-icon {
					width: 16px;
					height: 16px;
					flex-shrink: 0;
				}
			`,
				}}
			/>

			<div id="comment-container" ref={containerRef}>
				{comments.map(comment => {
					if (comment.isEffect) {
						return (
							<div
								key={comment.id}
								className="comment effect-line"
								data-id={comment.id}
								data-name={comment.name}
								data-comment={comment.message}
								data-donation="true"
							>
								<div className="comment-content">
									<div className="comment-header">
										<span className="time" data-time={comment.timestamp}>
											{comment.timestamp}
										</span>
									</div>
									<div className="message" data-text={comment.message}>
										{comment.message}
									</div>
								</div>
							</div>
						);
					}

					// Tiered (fiat) superchats carry the shared amount-tier colors
					// inline; untiered crypto keeps the classic gold classes.
					const donationClasses = comment.isDonation
						? `donation${comment.tier ? ' tiered' : ''}${comment.isSuperHighValue ? ' super-high-value' : comment.isHighValue ? ' high-value' : ''}`
						: '';
					return (
						<div
							key={comment.id}
							className={`comment ${donationClasses}`}
							style={
								comment.tier
									? { background: comment.tier.body, border: `2px solid ${comment.tier.header}` }
									: undefined
							}
							data-id={comment.id}
							data-name={comment.name}
							data-comment={comment.message}
							data-donation={comment.isDonation ? 'true' : 'false'}
						>
							<div className="comment-content">
								<div className="comment-header">
									<span
										className="time"
										data-time={comment.timestamp}
										style={comment.tier ? { color: comment.tier.bodyText, opacity: 0.7 } : undefined}
									>
										{comment.timestamp}
									</span>
									{comment.isDonation && (
										<>
											<span
												className="donation-badge"
												style={
													comment.tier
														? {
																background: comment.tier.header,
																color: comment.tier.headerText,
																textShadow: 'none',
																animation: 'none',
															}
														: undefined
												}
											>
												💰 {comment.donationAmount}
											</span>
											<span
												className="donation-name-label"
												style={
													comment.tier ? { color: comment.tier.bodyText, opacity: 0.75 } : undefined
												}
											>
												from
											</span>
										</>
									)}
									<span
										className="name"
										data-username={comment.name}
										style={comment.tier ? { color: comment.tier.bodyText } : undefined}
									>
										{comment.name}
									</span>
								</div>
								<div
									className="message"
									data-text={comment.message}
									style={comment.tier ? { color: comment.tier.bodyText } : undefined}
								>
									{comment.message}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}
