// Full-screen celebration overlay played when a viewer purchases a screen
// effect. Effect purchases arrive over the websocket as DONATION events with
// itemType === "effect", get queued in the zustand store, and play here one at
// a time for every viewer. Every particle is drawn entirely in CSS (gradients,
// clip-path, masks, box-shadow) — no emoji glyphs, whose baked-in backgrounds
// looked opaque and cheap over the video — and animated with CSS keyframes.
import { CSSProperties, FC, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ScreenEffectQueueItem,
	useDequeueScreenEffect,
	useScreenEffectQueue,
} from '../../stores/zustand-store';
import { getScreenEffectEmoji } from '../../../interfaces/donation.model';
import styles from './ScreenEffects.module.scss';

// How long one effect stays on screen. Particle delays and durations are tuned
// to finish inside this window; keep it in sync with the animation timings in
// ScreenEffects.module.scss (the pill animation is 5.5s).
const EFFECT_DURATION_MS = 5500;

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
	style: CSSProperties;
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const ri = (min: number, max: number): number => Math.round(rand(min, max));

// 🎉 Confetti: colored strips (some circles) raining down with sway and spin.
const makeConfetti = (count: number, keyOffset = 0): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: keyOffset + i,
		kind: 'confetti' as const,
		style: {
			left: `${rand(0, 98).toFixed(2)}%`,
			'--w': `${ri(7, 13)}px`,
			'--h': `${ri(5, 10)}px`,
			'--hue': `${ri(0, 360)}`,
			'--round': Math.random() < 0.28 ? '50%' : '2px',
			animationDuration: `${rand(2.8, 4).toFixed(2)}s`,
			animationDelay: `${rand(0, 1.4).toFixed(2)}s`,
			'--sway': `${ri(-120, 120)}px`,
			'--spin': `${ri(-720, 720)}deg`,
		} as CSSProperties,
	}));

// 🎆 Rockets launching from the bottom; each bursts (a radial flash + a spark
// starburst, both CSS) at its randomized apex.
const makeFireworks = (count: number, keyOffset = 0): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: keyOffset + i,
		kind: 'firework' as const,
		style: {
			left: `${rand(5, 90).toFixed(2)}%`,
			'--delay': `${rand(0, 2.4).toFixed(2)}s`,
			'--rise': `${ri(-70, -40)}vh`,
			'--rise-duration': `${rand(0.8, 1.3).toFixed(2)}s`,
			'--hue': `${ri(0, 360)}`,
			'--burst-size': `${ri(90, 150)}px`,
		} as CSSProperties,
	}));

// 💖 Hearts: pink/red CSS hearts (an SVG mask over a shiny fill) floating up.
const makeHearts = (count: number): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: i,
		kind: 'heart' as const,
		style: {
			left: `${rand(2, 96).toFixed(2)}%`,
			'--sz': `${ri(20, 40)}px`,
			'--hue': `${ri(330, 366) % 360}`,
			animationDuration: `${rand(3, 4.2).toFixed(2)}s`,
			animationDelay: `${rand(0, 1.2).toFixed(2)}s`,
			'--sway': `${ri(-90, 90)}px`,
		} as CSSProperties,
	}));

// ⭐ Shooting stars: a glowing head with a fading tail streaking diagonally.
const makeStars = (count: number): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: i,
		kind: 'star' as const,
		style: {
			left: `${rand(-10, 70).toFixed(2)}%`,
			top: `${rand(-8, 30).toFixed(2)}vh`,
			animationDuration: `${rand(1, 1.6).toFixed(2)}s`,
			animationDelay: `${rand(0, 3.4).toFixed(2)}s`,
			'--angle': `${ri(24, 40)}deg`,
			'--travel': `${ri(105, 140)}vh`,
			'--tail': `${ri(60, 120)}px`,
		} as CSSProperties,
	}));

// 🎊 Celebration: a dense confetti storm plus a full round of firework bursts.
const makeCelebration = (): Particle[] => [...makeConfetti(60), ...makeFireworks(16, 60)];

// 🌈 Rainbow: a CSS arc (masked conic gradient) scaling in at center, ringed by
// twinkling CSS sparkles; a soft rainbow wash is drawn separately in the JSX.
const makeRainbow = (): Particle[] => [
	{ key: 0, kind: 'rainbow' as const, style: {} as CSSProperties },
	...Array.from({ length: 30 }, (_, i) => ({
		key: i + 1,
		kind: 'sparkle' as const,
		style: {
			left: `${rand(14, 82).toFixed(2)}%`,
			top: `${rand(14, 74).toFixed(2)}%`,
			'--sz': `${ri(12, 26)}px`,
			'--hue': `${ri(0, 360)}`,
			animationDuration: `${rand(1.2, 2).toFixed(2)}s`,
			animationDelay: `${rand(0, 3.2).toFixed(2)}s`,
		} as CSSProperties,
	})),
];

// ☄️ Meteor shower: the lavish streaks — big, fast glowing heads with a thick
// tail. Each meteor takes a random hue so the shower is a colourful spectacle
// (a warm bias keeps most looking like fireballs).
const makeMeteors = (count: number): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: i,
		kind: 'meteor' as const,
		style: {
			left: `${rand(-15, 75).toFixed(2)}%`,
			top: `${rand(-12, 28).toFixed(2)}vh`,
			animationDuration: `${rand(0.7, 1.1).toFixed(2)}s`,
			animationDelay: `${rand(0, 3.8).toFixed(2)}s`,
			'--angle': `${ri(28, 46)}deg`,
			'--travel': `${ri(115, 150)}vh`,
			'--tail': `${ri(140, 240)}px`,
			// Mostly warm (fireball) hues with some cool ones mixed in for colour.
			'--hue': `${i % 3 === 0 ? ri(0, 360) : ri(18, 55)}`,
		} as CSSProperties,
	}));

// 💰 Gold rush: the top tier — a heavy rain of shiny coins, plus twinkling gold
// glints and a shower of gold dust, all under a pulsing golden flash.
const makeGoldCoins = (count: number): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: i,
		kind: 'coin' as const,
		style: {
			left: `${rand(0, 98).toFixed(2)}%`,
			'--sz': `${ri(22, 44)}px`,
			animationDuration: `${rand(2.2, 3.6).toFixed(2)}s`,
			animationDelay: `${rand(0, 1.8).toFixed(2)}s`,
			'--sway': `${ri(-100, 100)}px`,
			'--spin': `${ri(-720, 720)}deg`,
		} as CSSProperties,
	}));

const makeGoldDust = (count: number, keyOffset: number): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: keyOffset + i,
		kind: 'confetti' as const,
		style: {
			left: `${rand(0, 98).toFixed(2)}%`,
			'--w': `${ri(4, 8)}px`,
			'--h': `${ri(4, 8)}px`,
			'--hue': `${ri(40, 52)}`,
			'--round': '50%',
			animationDuration: `${rand(2.4, 3.8).toFixed(2)}s`,
			animationDelay: `${rand(0, 2).toFixed(2)}s`,
			'--sway': `${ri(-80, 80)}px`,
			'--spin': `${ri(-360, 360)}deg`,
		} as CSSProperties,
	}));

const makeGoldGlints = (count: number, keyOffset: number): Particle[] =>
	Array.from({ length: count }, (_, i) => ({
		key: keyOffset + i,
		kind: 'sparkle' as const,
		style: {
			left: `${rand(4, 94).toFixed(2)}%`,
			top: `${rand(8, 88).toFixed(2)}%`,
			'--sz': `${ri(12, 26)}px`,
			'--hue': `${ri(42, 50)}`,
			animationDuration: `${rand(1, 1.8).toFixed(2)}s`,
			animationDelay: `${rand(0, 3.4).toFixed(2)}s`,
		} as CSSProperties,
	}));

const makeGoldrush = (count: number): Particle[] => [
	...makeGoldCoins(count),
	...makeGoldDust(40, count),
	...makeGoldGlints(22, count + 40),
];

// Effects are priced in ascending tiers (see models/donation.go effectPrices):
// confetti < hearts < stars < fireworks < celebration < rainbow < meteor <
// goldrush. Particle budgets rise monotonically with that tier so the spectacle
// escalates with the amount paid. Streak/burst particles carry more visual
// weight each, so their counts stay lower than the light falling effects.
const makeParticles = (effectType: string): Particle[] => {
	switch (effectType) {
		case 'hearts': // tier 1
			return makeHearts(30);
		case 'stars': // tier 2
			return makeStars(20);
		case 'fireworks': // tier 3
			return makeFireworks(22);
		case 'celebration': // tier 4
			return makeCelebration();
		case 'rainbow': // tier 5
			return makeRainbow();
		case 'meteor': // tier 6
			return makeMeteors(46);
		case 'goldrush': // tier 7
			return makeGoldrush(84);
		case 'confetti': // tier 0
		default:
			return makeConfetti(24);
	}
};

// CSS class for single-element particle kinds (fireworks render nested spans).
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
						<span className={styles.fireworkRocket} />
						<span className={styles.fireworkBurst} />
					</span>
				) : (
					<span key={particle.key} className={PARTICLE_CLASS[particle.kind]} style={particle.style} />
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
