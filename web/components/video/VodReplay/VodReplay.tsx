import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { ArchiveEvent } from '../../../interfaces/archive.model';
import { ScreenEffects } from '../../ui/ScreenEffects/ScreenEffects';
import { VodPlayer } from '../VodPlayer/VodPlayer';
import { useArchiveReplay } from './useArchiveReplay';
import styles from './VodReplay.module.scss';

// ChatContainer pulls in react-virtuoso, which touches the DOM, so it must
// only run on the client.
const ChatContainer = dynamic(
	() => import('../../chat/ChatContainer/ChatContainer').then(mod => mod.ChatContainer),
	{ ssr: false },
);

export interface VodReplayProps {
	source: string;
	// MIME type of the source ('video/mp4' for the single-file replay);
	// defaults to HLS.
	sourceType?: string;
	title?: string;
	// Recorded broadcast events for this archive. An empty array means the
	// archive has no synchronized replay, so only the video is shown.
	events: ArchiveEvent[];
}

// VOD player with a synchronized replay of the chat and screen effects that
// happened during the live stream. Effects overlay the whole page (the shared
// <ScreenEffects /> is a fixed overlay); the read-only chat sits beside the
// player, matching the live layout. The chat column is always shown for a
// consistent layout — it is simply empty when the archive recorded no chat.
export const VodReplay: FC<VodReplayProps> = ({ source, sourceType, title, events }) => {
	const { t } = useTranslation();
	const { messages, handlePlayerReady } = useArchiveReplay(events);

	return (
		<div className={styles.layout}>
			<div className={styles.playerColumn}>
				<VodPlayer
					source={source}
					sourceType={sourceType}
					title={title}
					onPlayerReady={handlePlayerReady}
				/>
				{/* Fixed full-screen overlay (z-index 950) that plays purchased effects. */}
				<ScreenEffects />
			</div>
			<div className={styles.chatColumn}>
				<div className={styles.chatHeader}>{t('archives.chatReplay')}</div>
				<div className={styles.chatBody}>
					<ChatContainer
						messages={messages}
						usernameToHighlight=""
						chatUserId=""
						isModerator={false}
						showInput={false}
						chatAvailable={false}
						height="100%"
					/>
				</div>
			</div>
		</div>
	);
};

export default VodReplay;
