import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { OwncastLogo } from '../../common/OwncastLogo/OwncastLogo';
import styles from './Noscript.module.scss';

export const Noscript: FC = () => {
	const { t } = useTranslation();

	return (
		<noscript className={styles.noscript}>
			<div className={styles.scrollContainer}>
				<div className={styles.content}>
					<OwncastLogo className={styles.logo} />
					<br />
					<p>
						{t('ui.noscript.poweredByPrefix')}&nbsp;
						<a href="https://github.com/AoiAsakawa/aoitube" rel="noopener noreferrer" target="_blank">
							AoiTube
						</a>
						&nbsp;{t('ui.noscript.poweredBySuffix')}
					</p>
					<p>{t('ui.noscript.jsRequired')}</p>
					<p>{t('ui.noscript.enableJs')}</p>
					<h2>{t('ui.noscript.watchWithoutJsTitle')}</h2>
					<p>
						{t('ui.noscript.mediaPlayerPrefix')}&nbsp;
						<a href="https://mpv.io" rel="noopener noreferrer" target="_blank">
							mpv
						</a>
						&nbsp;or&nbsp;
						<a href="https://www.videolan.org/vlc/" rel="noopener noreferrer" target="_blank">
							VLC
						</a>
						{t('ui.noscript.mediaPlayerSuffix')}
					</p>
					<h2>{t('ui.noscript.chatWithoutJsTitle')}</h2>
					<p>{t('ui.noscript.chatWithoutJsBody')}</p>
				</div>
			</div>
		</noscript>
	);
};
