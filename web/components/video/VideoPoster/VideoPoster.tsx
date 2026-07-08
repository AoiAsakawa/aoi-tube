import { FC, useEffect, useState } from 'react';
import { CrossfadeImage } from '../../ui/CrossfadeImage/CrossfadeImage';
import styles from './VideoPoster.module.scss';

const REFRESH_INTERVAL = 20_000;

export type VideoPosterProps = {
	initialSrc: string;
	src: string;
	online: boolean;
};

export const VideoPoster: FC<VideoPosterProps> = ({ online, initialSrc, src: base }) => {
	const [src, setSrc] = useState(initialSrc);
	const [duration, setDuration] = useState('0s');

	// Follow base URL changes: the chat access token arrives asynchronously
	// after the player mounts, and auth-required streams answer token-less
	// poster requests with the logo. A stale closure here once pinned every
	// refresh to the token-less URL, so the logo never went away.
	useEffect(() => {
		setSrc(base);
		const timer = setInterval(() => {
			setDuration('3s');
			// The base URL may already carry a query (accessToken), so the
			// cache-buster must join with '&' in that case.
			setSrc(`${base}${base.includes('?') ? '&' : '?'}${Date.now()}`);
		}, REFRESH_INTERVAL);
		return () => clearInterval(timer);
	}, [base]);

	return (
		<div className={styles.poster}>
			{!online && <img src={initialSrc} alt="logo" />}

			{online && (
				<CrossfadeImage
					src={src}
					duration={duration}
					objectFit="contain"
					// The crossfade wrapper's children are absolutely positioned, so
					// an "auto" height collapsed to 0 and rendered a black poster.
					height="100%"
					width="100%"
					className={styles.image}
				/>
			)}
		</div>
	);
};
