/**
 * This component is responsible for updating the title of the page when
 * different state changes occur.
 * If the stream live state changes, or chat messages come in while the
 * page is backgrounded, this component will update the title to reflect it. *
 * @component
 */
import { FC, useEffect, useState } from 'react';
import Head from '@components/compat/Head';
import { useServerStatus, useChatMessages } from '../stores/zustand-store';
import { MessageType } from '../../interfaces/socket-events';

export type TitleNotifierProps = {
	name: string;
};

export const TitleNotifier: FC<TitleNotifierProps> = ({ name }) => {
	const chatMessages = useChatMessages();
	const serverStatus = useServerStatus();

	const [backgrounded, setBackgrounded] = useState(false);
	const [title, setTitle] = useState(name);

	const { online } = serverStatus;

	const onBlur = () => {
		setBackgrounded(true);
	};

	const onFocus = () => {
		setBackgrounded(false);
		setTitle(name);
	};

	const listenForEvents = () => {
		// Listen for events that should update the title
		window.addEventListener('blur', onBlur);
		window.addEventListener('focus', onFocus);
	};

	const removeEvents = () => {
		window.removeEventListener('blur', onBlur);
		window.removeEventListener('focus', onFocus);
	};

	useEffect(() => {
		listenForEvents();
		setTitle(name);

		return () => {
			removeEvents();
		};
	}, [name]);

	useEffect(() => {
		if (!backgrounded || !online) {
			return;
		}

		// Only alert on real chat messages from people.
		const lastMessage = chatMessages[chatMessages.length - 1];
		if (lastMessage.type !== MessageType.CHAT) {
			return;
		}

		setTitle(`💬 :: ${name}`);
	}, [chatMessages, name]);

	useEffect(() => {
		if (!backgrounded) {
			return;
		}
		if (online) {
			setTitle(` 🟢 :: ${name}`);
		} else if (!online) {
			setTitle(` 🔴 :: ${name}`);
		}
	}, [online, name]);

	return (
		<Head>
			<title>{title}</title>
		</Head>
	);
};
