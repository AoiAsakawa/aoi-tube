import { FC } from 'react';
import styles from './Logo.module.scss';

export type LogoProps = {
	src: string;
};

// Sizing lives in Logo.module.scss only; the stylesheet is bundled and loads
// before render, so the old inline-style / HTML-shell FOUC guards are gone.
export const Logo: FC<LogoProps> = ({ src }) => (
	<div className={styles.root}>
		<div className={styles.container}>
			<img src={src} alt="Logo" className={styles.image} loading="lazy" />
		</div>
	</div>
);
