// Full-screen celebration overlay played when a viewer purchases a screen
// effect. Effect purchases arrive over the websocket as DONATION events with
// itemType === "effect", get queued in the zustand store, and play here one
// at a time for every viewer. Everything is rendered with CSS keyframes on
// emoji particles — no animation library required.
import { CSSProperties, FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ScreenEffectQueueItem,
	useDequeueScreenEffect,
	useScreenEffectQueue,
} from '../../stores/zustand-store';
import { getScreenEffectEmoji } from '../../../interfaces/donation.model';
import styles from './ScreenEffects.module.scss';

// How long one effect stays on screen. Particle delays and durations are
// tuned to finish inside this window; keep it in sync with the animation
// timings in ScreenEffects.module.scss (pill animation is 5.5s).
const EFFECT_DURATION_MS = 5500;

const CONFETTI_EMOJIS = ['🎉', '🎊', '✨'];
const FIREWORK_BURST_EMOJIS = ['🎆', '🎇'];
const HEART_EMOJIS = ['💖', '💕', '💗'];
const STAR_EMOJIS = ['⭐', '✨', '🌟'];
// Celebration mixes dense falling party emojis with firework bursts.
const CELEBRATION_FALL_EMOJIS = ['🎊', '🎉', '✨'];
// Rainbow surrounds the central arc with twinkling sparkles.
const RAINBOW_SPARKLE_EMOJIS = ['✨', '🌟', '💫'];
// Meteor shower: a denser, faster, brighter take on the star streaks.
const METEOR_EMOJIS = ['☄️', '💫', '⭐'];
// Gold rush: a heavy rain of money emojis under a golden glow.
const GOLDRUSH_EMOJIS = ['💰', '🪙', '✨'];

// How a particle animates; celebration mixes several kinds in one effect.
type ParticleKind =
	| 'confetti'
	| 'heart'
	| 'firework'
	| 'star'
	| 'rainbow'
	| 'sparkle'
	| 'meteor'
	| 'coin';

interface Particle {
	key: number;
	kind: ParticleKind;
	emoji: string;
	style: CSSProperties;
}

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);

const pick = (list: string[]): string => list[Math.floor(Math.random() * list.length)];

// 🎉 Confetti raining down from the top with random positions, delays,
// horizontal sway and spin. keyOffset keeps keys unique in mixed effects.
const makeConfettiParticles = (emojis: string[], count: number, keyOffset = 0): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: keyOffset + i,
		kind: 'confetti' as const,
		emoji: pick(emojis),
		style: {
			left: `${randomBetween(0, 98).toFixed(2)}%`,
			fontSize: `${Math.round(randomBetween(16, 34))}px`,
			animationDuration: `${randomBetween(2.8, 4).toFixed(2)}s`,
			animationDelay: `${randomBetween(0, 1.4).toFixed(2)}s`,
			'--sway': `${Math.round(randomBetween(-120, 120))}px`,
			'--spin': `${Math.round(randomBetween(-720, 720))}deg`,
		} as CSSProperties,
	}));

// 🎆 Rockets launching from the bottom; each one bursts (scales up and fades)
// once it reaches its randomized apex.
const makeFireworkParticles = (count: number, keyOffset = 0): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: keyOffset + i,
		kind: 'firework' as const,
		emoji: pick(FIREWORK_BURST_EMOJIS),
		style: {
			left: `${randomBetween(5, 90).toFixed(2)}%`,
			fontSize: `${Math.round(randomBetween(26, 44))}px`,
			'--delay': `${randomBetween(0, 2.4).toFixed(2)}s`,
			'--rise': `${Math.round(randomBetween(-70, -40))}vh`,
			'--rise-duration': `${randomBetween(0.8, 1.3).toFixed(2)}s`,
		} as CSSProperties,
	}));

// 💖 Hearts floating up from the bottom, swaying and fading out.
const makeHeartParticles = (): Particle[] =>
	Array.from({ length: 24 }, (_, i) => ({
		key: i,
		kind: 'heart' as const,
		emoji: pick(HEART_EMOJIS),
		style: {
			left: `${randomBetween(2, 96).toFixed(2)}%`,
			fontSize: `${Math.round(randomBetween(18, 38))}px`,
			animationDuration: `${randomBetween(3, 4.2).toFixed(2)}s`,
			animationDelay: `${randomBetween(0, 1.2).toFixed(2)}s`,
			'--sway': `${Math.round(randomBetween(-90, 90))}px`,
		} as CSSProperties,
	}));

// ⭐ Shooting stars streaking diagonally across the screen with a light
// tail. The whole span is rotated by --angle and travels along its local
// x-axis, so the tail (a ::before gradient) always trails the motion.
const makeStarParticles = (): Particle[] =>
	Array.from({ length: 16 }, (_, i) => ({
		key: i,
		kind: 'star' as const,
		emoji: pick(STAR_EMOJIS),
		style: {
			left: `${randomBetween(-10, 70).toFixed(2)}%`,
			top: `${randomBetween(-8, 30).toFixed(2)}vh`,
			fontSize: `${Math.round(randomBetween(16, 32))}px`,
			animationDuration: `${randomBetween(1, 1.6).toFixed(2)}s`,
			animationDelay: `${randomBetween(0, 3.4).toFixed(2)}s`,
			'--angle': `${Math.round(randomBetween(24, 40))}deg`,
			'--travel': `${Math.round(randomBetween(105, 140))}vh`,
			'--tail': `${Math.round(randomBetween(50, 110))}px`,
		} as CSSProperties,
	}));

// 🎊 Celebration: the most lavish effect — a dense storm of falling party
// emojis combined with a full round of firework bursts.
const makeCelebrationParticles = (): Particle[] => [
	...makeConfettiParticles(CELEBRATION_FALL_EMOJIS, 56),
	...makeFireworkParticles(12, 56),
];

// 🌈 Rainbow: one large arc scaling in at the center of the screen (position
// and animation are fully defined in CSS), surrounded by twinkling sparkles.
// A soft rainbow-gradient glow overlay is rendered separately in the JSX.
const makeRainbowParticles = (): Particle[] => [
	{ key: 0, kind: 'rainbow' as const, emoji: '🌈', style: {} as CSSProperties },
	...Array.from({ length: 20 }, (_, i) => ({
		key: i + 1,
		kind: 'sparkle' as const,
		emoji: pick(RAINBOW_SPARKLE_EMOJIS),
		style: {
			left: `${randomBetween(18, 80).toFixed(2)}%`,
			top: `${randomBetween(16, 72).toFixed(2)}%`,
			fontSize: `${Math.round(randomBetween(14, 32))}px`,
			animationDuration: `${randomBetween(1.2, 2).toFixed(2)}s`,
			animationDelay: `${randomBetween(0, 3.2).toFixed(2)}s`,
		} as CSSProperties,
	})),
];

// ☄️ Meteor shower: the lavish version of the star streaks — many more,
// bigger and faster particles with a thick glowing tail. Reuses the star
// streak geometry (--angle / --travel / --tail) with its own styling.
const makeMeteorParticles = (): Particle[] =>
	Array.from({ length: 34 }, (_, i) => ({
		key: i,
		kind: 'meteor' as const,
		emoji: pick(METEOR_EMOJIS),
		style: {
			left: `${randomBetween(-15, 75).toFixed(2)}%`,
			top: `${randomBetween(-12, 28).toFixed(2)}vh`,
			fontSize: `${Math.round(randomBetween(22, 44))}px`,
			animationDuration: `${randomBetween(0.7, 1.1).toFixed(2)}s`,
			animationDelay: `${randomBetween(0, 3.8).toFixed(2)}s`,
			'--angle': `${Math.round(randomBetween(28, 46))}deg`,
			'--travel': `${Math.round(randomBetween(115, 150))}vh`,
			'--tail': `${Math.round(randomBetween(110, 200))}px`,
		} as CSSProperties,
	}));

// 💰 Gold rush: the top-tier effect — a dense rain of glowing coins (reusing
// the confetti fall path) plus a full-screen golden flash rendered in JSX.
const makeGoldrushParticles = (): Particle[] =>
	Array.from({ length: 64 }, (_, i) => ({
		key: i,
		kind: 'coin' as const,
		emoji: pick(GOLDRUSH_EMOJIS),
		style: {
			left: `${randomBetween(0, 98).toFixed(2)}%`,
			fontSize: `${Math.round(randomBetween(20, 42))}px`,
			animationDuration: `${randomBetween(2.2, 3.6).toFixed(2)}s`,
			animationDelay: `${randomBetween(0, 1.8).toFixed(2)}s`,
			'--sway': `${Math.round(randomBetween(-100, 100))}px`,
			'--spin': `${Math.round(randomBetween(-540, 540))}deg`,
		} as CSSProperties,
	}));

const makeParticles = (effectType: string): Particle[] => {
	switch (effectType) {
		case 'fireworks':
			return makeFireworkParticles(12);
		case 'hearts':
			return makeHeartParticles();
		case 'stars':
			return makeStarParticles();
		case 'celebration':
			return makeCelebrationParticles();
		case 'rainbow':
			return makeRainbowParticles();
		case 'meteor':
			return makeMeteorParticles();
		case 'goldrush':
			return makeGoldrushParticles();
		case 'confetti':
		default:
			return makeConfettiParticles(CONFETTI_EMOJIS, 40);
	}
};

// CSS class for single-span particle kinds (fireworks render nested spans).
const PARTICLE_CLASS: Record<Exclude<ParticleKind, 'firework'>, string> = {
	confetti: styles.confetti,
	heart: styles.heart,
	star: styles.star,
	rainbow: styles.rainbowArc,
	sparkle: styles.sparkle,
	meteor: styles.meteor,
	coin: styles.coin,
};

export const ScreenEffects: FC = () => {
	const { t } = useTranslation();
	const queue = useScreenEffectQueue();
	const dequeueScreenEffect = useDequeueScreenEffect();
	const [current, setCurrent] = useState<ScreenEffectQueueItem | null>(null);

	// Pull the next purchased effect off the queue when idle so consecutive
	// purchases play back to back instead of on top of each other.
	useEffect(() => {
		if (!current && queue.length > 0) {
			setCurrent(queue[0]);
			dequeueScreenEffect();
		}
	}, [queue, current, dequeueScreenEffect]);

	// Clear the playing effect once its animation window has elapsed.
	useEffect(() => {
		if (!current) {
			return undefined;
		}
		const timer = setTimeout(() => setCurrent(null), EFFECT_DURATION_MS);
		return () => clearTimeout(timer);
	}, [current]);

	// Particle randomization happens once per played effect.
	const particles = useMemo(() => (current ? makeParticles(current.effectType) : []), [current]);

	if (!current) {
		return null;
	}

	const senderName = current.isAnonymous ? t('chat.anonymous') : current.displayName;
	const effectName = t(`screenEffects.${current.effectType}`, {
		defaultValue: current.effectType,
	});

	return (
		<div className={styles.overlay} aria-hidden="true" data-testid="screen-effects">
			{/* Full-screen light washes behind the particles for the premium effects. */}
			{current.effectType === 'rainbow' && <div className={styles.rainbowGlow} />}
			{current.effectType === 'goldrush' && <div className={styles.goldFlash} />}
			{particles.map(particle =>
				particle.kind === 'firework' ? (
					<span key={particle.key} className={styles.firework} style={particle.style}>
						<span className={styles.fireworkRocket}>🎇</span>
						<span className={styles.fireworkBurst}>{particle.emoji}</span>
					</span>
				) : (
					<span key={particle.key} className={PARTICLE_CLASS[particle.kind]} style={particle.style}>
						{particle.emoji}
					</span>
				),
			)}
			<div className={styles.pill}>
				<span className={styles.pillEmoji}>{getScreenEffectEmoji(current.effectType)}</span>
				<span className={styles.pillText}>
					{current.isPreview
						? t('screenEffects.previewPill', { effect: effectName })
						: t('screenEffects.sentEffect', { name: senderName, effect: effectName })}
				</span>
			</div>
		</div>
	);
};

export default ScreenEffects;
