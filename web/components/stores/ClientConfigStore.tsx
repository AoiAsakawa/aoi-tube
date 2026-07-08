/**
 * ClientConfigStore - Zustand version
 *
 * Migrated from Recoil to Zustand for React 19 compatibility
 */
import { FC, useContext, useEffect, useState, useRef } from 'react';
import { useMachine } from '@xstate/react';
import { useShallow } from 'zustand/react/shallow';
import { ClientConfigServiceContext } from '../../services/client-config-service';
import { ChatServiceContext } from '../../services/chat-service';
import WebsocketService from '../../services/websocket-service';
import { ServerStatus } from '../../interfaces/server-status.model';
import appStateModel, { AppStateEvent, AppStateOptions } from './application-state';
import { setLocalStorage, getLocalStorage } from '../../utils/localStorage';
import {
	ConnectedClientInfoEvent,
	MessageType,
	ChatEvent,
	MessageVisibilityEvent,
	SocketEvent,
	FediverseEvent,
	DonationSocketEvent,
} from '../../interfaces/socket-events';
import { mergeMeta } from '../../utils/helpers';
import { isScreenEffectType } from '../../interfaces/donation.model';
import { handleConnectedClientInfoMessage } from './eventhandlers/connected-client-info-handler';
import { ServerStatusServiceContext } from '../../services/status-service';
import { handleNameChangeEvent } from './eventhandlers/handleNameChangeEvent';
import { useAppStore, setWebsocketDisconnected } from './zustand-store';

const SERVER_STATUS_POLL_DURATION = 5000;
const ACCESS_TOKEN_KEY = 'accessToken';

// How long a stream must stay offline before the rendered chat backlog is
// replaced with the server's (session-scoped) history. Long enough to ride
// out encoder blips and quick server restarts.
const OFFLINE_CHAT_HISTORY_REFRESH_MS = 90_000;

let serverStatusRefreshPoll: ReturnType<typeof setInterval>;
let hasBeenModeratorNotified = false;

const serverConnectivityError =
	'サーバーに接続できません。インターネット接続を確認し、サーバーが起動していることを確認してください。';

export const ClientConfigStore: FC = () => {
	const ClientConfigService = useContext(ClientConfigServiceContext);
	const ChatService = useContext(ChatServiceContext);
	const ServerStatusService = useContext(ServerStatusServiceContext);

	const [appState, appStateSend, appStateService] = useMachine(appStateModel);

	// Read only the values from the Zustand store (memoized via shallow comparison)
	const { currentUser, clientConfig, accessToken, hiddenMessageIds } = useAppStore(
		useShallow(s => ({
			currentUser: s.currentUser,
			clientConfig: s.clientConfig,
			accessToken: s.accessToken,
			hiddenMessageIds: s.hiddenMessageIds,
		})),
	);

	// Reference setter functions directly from store.getState() (stable references)
	const setCurrentUser = useAppStore.getState().setCurrentUser;
	const setChatAuthenticated = useAppStore.getState().setChatAuthenticated;
	const setClientConfig = useAppStore.getState().setClientConfig;
	const setServerStatus = useAppStore.getState().setServerStatus;
	const setClockSkew = useAppStore.getState().setClockSkew;
	const setChatMessages = useAppStore.getState().setChatMessages;
	const setAccessToken = useAppStore.getState().setAccessToken;
	const setAppState = useAppStore.getState().setAppState;
	const setGlobalFatalErrorMessage = useAppStore.getState().setFatalErrorState;
	const setWebsocketService = useAppStore.getState().setWebsocketService;
	const setHiddenMessageIds = useAppStore.getState().setHiddenMessageIds;
	const enqueueScreenEffect = useAppStore.getState().enqueueScreenEffect;

	const [hasLoadedConfig, setHasLoadedConfig] = useState(false);

	let ws: WebsocketService;

	const setGlobalFatalError = (title: string, message: string) => {
		setGlobalFatalErrorMessage({
			title,
			message,
		});
	};

	const sendEvent = (events: string[]) => {
		// xstate 5.x requires sending each event individually
		events.forEach(event => {
			appStateSend({ type: event });
		});
	};

	// When a stream truly ends (not just a blip), refetch the chat backlog:
	// the server scopes user-facing history to the current session, so this
	// drops the ended stream's messages from long-lived tabs and OBS overlay
	// embeds, which otherwise keep every rendered message forever. Refs are
	// required — the status poll runs in the first render's closure.
	const prevOnlineRef = useRef<boolean | null>(null);
	const offlineHistoryTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

	const scheduleOfflineHistoryRefresh = (online: boolean) => {
		const wasOnline = prevOnlineRef.current;
		prevOnlineRef.current = online;

		if (online) {
			if (offlineHistoryTimerRef.current) {
				clearTimeout(offlineHistoryTimerRef.current);
				offlineHistoryTimerRef.current = null;
			}
			return;
		}

		if (wasOnline !== true || offlineHistoryTimerRef.current) {
			return;
		}

		offlineHistoryTimerRef.current = setTimeout(async () => {
			offlineHistoryTimerRef.current = null;
			try {
				const token = useAppStore.getState().accessToken;
				const messages = await ChatService.getChatHistory(token);
				setChatMessages(messages || []);
			} catch (error) {
				console.error(`ChatService -> getChatHistory() ERROR: \n${error}`);
			}
		}, OFFLINE_CHAT_HISTORY_REFRESH_MS);
	};

	const handleStatusChange = (status: ServerStatus) => {
		scheduleOfflineHistoryRefresh(status.online);

		if (appState.matches('loading')) {
			const events = [AppStateEvent.Loaded];
			if (status.online) {
				events.push(AppStateEvent.Online);
			} else {
				events.push(AppStateEvent.Offline);
			}
			sendEvent(events);
			return;
		}

		if (status.online && appState.matches('ready')) {
			sendEvent([AppStateEvent.Online]);
		} else if (!status.online && !appState.matches('ready.offline')) {
			sendEvent([AppStateEvent.Offline]);
		}
	};

	const updateClientConfig = async () => {
		try {
			const config = await ClientConfigService.getConfig();
			setClientConfig(config);
			setGlobalFatalErrorMessage(null);
			setHasLoadedConfig(true);
		} catch (error) {
			setGlobalFatalError('AoiTube サーバーに接続できません', serverConnectivityError);
			console.error(`ClientConfigService -> getConfig() ERROR: \n`, error);
		}
	};

	const updateServerStatus = async () => {
		try {
			const status = await ServerStatusService.getStatus();
			handleStatusChange(status);
			setServerStatus(status);

			const { serverTime } = status;

			const clockSkew = new Date(serverTime).getTime() - Date.now();
			setClockSkew(clockSkew);

			setGlobalFatalErrorMessage(null);
		} catch (error) {
			sendEvent([AppStateEvent.Fail]);
			setGlobalFatalError('AoiTube サーバーに接続できません', serverConnectivityError);
			console.error(`serverStatusState -> getStatus() ERROR: \n`, error);
		}
	};

	const handleUserRegistration = async (optionalDisplayName?: string) => {
		const savedAccessToken = getLocalStorage(ACCESS_TOKEN_KEY);
		if (savedAccessToken) {
			setAccessToken(savedAccessToken);
			return;
		}

		try {
			sendEvent([AppStateEvent.NeedsRegister]);
			const response = await ChatService.registerUser(optionalDisplayName);
			const { accessToken: newAccessToken, displayName: newDisplayName, displayColor } = response;
			if (!newAccessToken) {
				return;
			}

			setCurrentUser({
				...currentUser,
				displayName: newDisplayName,
				displayColor,
			});
			setAccessToken(newAccessToken);
			setLocalStorage(ACCESS_TOKEN_KEY, newAccessToken);
		} catch (e) {
			sendEvent([AppStateEvent.Fail]);
			console.error(`ChatService -> registerUser() ERROR: \n${e}`);
		}
	};

	const resetAndReAuth = () => {
		setLocalStorage(ACCESS_TOKEN_KEY, '');
		setAccessToken(null);
		ws?.shutdown();
		handleUserRegistration();
	};

	const handleMessageVisibilityChange = (message: MessageVisibilityEvent) => {
		const { ids, visible } = message;
		if (visible) {
			const updatedIds = hiddenMessageIds.filter(id => !ids.includes(id));
			setHiddenMessageIds(updatedIds);
		} else {
			const updatedIds = [...hiddenMessageIds, ...ids];
			setHiddenMessageIds(updatedIds);
		}
	};

	const handleSocketDisconnect = () => {
		setWebsocketDisconnected(true);
	};

	const handleSocketConnected = () => {
		setWebsocketDisconnected(false);
	};

	const handleMessage = (message: SocketEvent) => {
		switch (message.type) {
			case MessageType.ERROR_NEEDS_REGISTRATION:
				resetAndReAuth();
				break;
			case MessageType.CONNECTED_USER_INFO:
				handleConnectedClientInfoMessage(
					message as ConnectedClientInfoEvent,
					setChatAuthenticated,
					setCurrentUser,
				);
				if (message as ChatEvent) {
					const m = new ChatEvent(message);
					if (!hasBeenModeratorNotified && m.user?.isModerator()) {
						setChatMessages(currentState => [...currentState, message as ChatEvent]);
						hasBeenModeratorNotified = true;
					}
				}
				break;
			case MessageType.CHAT:
				setChatMessages(currentState => [...currentState, message as ChatEvent]);
				break;
			case MessageType.NAME_CHANGE:
				handleNameChangeEvent(message as ChatEvent, setChatMessages);
				break;
			case MessageType.USER_JOINED:
				setChatMessages(currentState => [...currentState, message as ChatEvent]);
				break;
			case MessageType.SYSTEM:
				setChatMessages(currentState => [...currentState, message as ChatEvent]);
				break;
			case MessageType.CHAT_ACTION:
				setChatMessages(currentState => [...currentState, message as ChatEvent]);
				break;
			case MessageType.FEDIVERSE_ENGAGEMENT_FOLLOW:
				setChatMessages(currentState => [...currentState, message as FediverseEvent]);
				break;
			case MessageType.FEDIVERSE_ENGAGEMENT_LIKE:
				setChatMessages(currentState => [...currentState, message as FediverseEvent]);
				break;
			case MessageType.FEDIVERSE_ENGAGEMENT_REPOST:
				setChatMessages(currentState => [...currentState, message as FediverseEvent]);
				break;
			case MessageType.DONATION: {
				const donation = message as DonationSocketEvent;
				// Screen effect purchases play a full-screen effect for all viewers.
				// Superchats may omit itemType entirely, so only explicit "effect"
				// events with a known effect type are queued.
				if (donation.itemType === 'effect' && isScreenEffectType(donation.effectType)) {
					enqueueScreenEffect({
						id: donation.donationId || donation.id,
						effectType: donation.effectType,
						displayName: donation.displayName,
						isAnonymous: donation.isAnonymous,
					});
				}
				// Append donation events to the chat messages
				setChatMessages(currentState => [...currentState, donation]);
				break;
			}
			case MessageType.VISIBILITY_UPDATE:
				handleMessageVisibilityChange(message as MessageVisibilityEvent);
				break;
			case MessageType.ERROR_USER_DISABLED:
				console.log('User has been disabled');
				sendEvent([AppStateEvent.ChatUserDisabled]);
				break;
			default:
				console.error('Unknown socket message type: ', message.type);
		}
	};

	const getChatHistory = async () => {
		try {
			const messages = await ChatService.getChatHistory(accessToken);
			if (messages) {
				setChatMessages(currentState => [...currentState, ...messages]);
			}
		} catch (error) {
			console.error(`ChatService -> getChatHistory() ERROR: \n${error}`);
		}
	};

	const startChat = async () => {
		try {
			if (ws) {
				ws?.shutdown();
				setWebsocketService(null);
				ws = null;
			}

			const { socketHostOverride } = clientConfig;

			const l = window.location;
			l.hash = '';
			const location = l.toString().replaceAll('#', '');
			const host = socketHostOverride || location;

			ws = new WebsocketService(accessToken, '/ws', host);
			ws.handleMessage = handleMessage;
			ws.socketDisconnected = handleSocketDisconnect;
			ws.socketConnected = handleSocketConnected;
			setWebsocketService(ws);
		} catch (error) {
			console.error(`ChatService -> startChat() ERROR: \n${error}`);
			sendEvent([AppStateEvent.ChatUserDisabled]);
		}
	};

	useEffect(() => {
		try {
			if ((window as any).configHydration) {
				const config = JSON.parse((window as any).configHydration);
				setClientConfig(config);
				setHasLoadedConfig(true);
			}
		} catch (e) {
			console.error('Error parsing config hydration', e);
		}

		try {
			if ((window as any).statusHydration) {
				const status = JSON.parse((window as any).statusHydration);
				setServerStatus(status);
				handleStatusChange(status);
			}
		} catch (e) {
			console.error('error parsing status hydration', e);
		}
	}, []);

	useEffect(() => {
		if (clientConfig.chatDisabled) {
			return;
		}

		if (!accessToken) {
			return;
		}

		if (!hasLoadedConfig) {
			return;
		}

		if (ws) {
			return;
		}

		startChat();
	}, [hasLoadedConfig, accessToken]);

	useEffect(() => {
		updateClientConfig();
		handleUserRegistration();
		updateServerStatus();

		clearInterval(serverStatusRefreshPoll);
		serverStatusRefreshPoll = setInterval(() => {
			updateServerStatus();
		}, SERVER_STATUS_POLL_DURATION);

		return () => {
			clearInterval(serverStatusRefreshPoll);
		};
	}, []);

	useEffect(() => {
		if (accessToken) {
			getChatHistory();
		}
	}, [accessToken]);

	// Ref holding the previous metadata (prevents infinite loops)
	const prevMetaJsonRef = useRef('');
	const setAppStateRef = useRef(setAppState);
	setAppStateRef.current = setAppState;

	useEffect(() => {
		// In xstate 5.x, metadata is read via state.meta
		const subscription = appStateService.subscribe(snapshot => {
			// XState 5.x metadata retrieval
			const snapshotAny = snapshot as any;
			const meta = snapshotAny.getMeta?.() || snapshotAny.meta || {};
			const mergedMeta = mergeMeta(meta) as AppStateOptions;

			// Skip when the metadata is empty
			if (Object.keys(mergedMeta).length === 0) {
				return;
			}

			// Skip when the state has not changed (prevents infinite loops)
			const metaJson = JSON.stringify(mergedMeta);
			if (metaJson === prevMetaJsonRef.current) {
				return;
			}
			prevMetaJsonRef.current = metaJson;

			setAppStateRef.current(mergedMeta);
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [appStateService]);

	return null;
};
