/**
 * Zustand Store - React 19-compatible state management
 * Store used for the migration from Recoil to Zustand
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { makeEmptyClientConfig, ClientConfig } from '../../interfaces/client-config.model';
import { ChatMessage } from '../../interfaces/chat-message.model';
import { CurrentUser } from '../../interfaces/current-user';
import { ServerStatus, makeEmptyServerStatus } from '../../interfaces/server-status.model';
import { AppStateOptions, makeEmptyAppState } from './application-state';
import WebsocketService from '../../services/websocket-service';
import { DisplayableError } from '../../types/displayable-error';
import { SocketEvent } from '../../interfaces/socket-events';
import { ChatService } from '../../services/chat-service';
import { setLocalStorage } from '../../utils/localStorage';

// LocalStorage key for the anonymous chat access token. Must match the key
// ClientConfigStore uses to restore the session on load.
const ACCESS_TOKEN_KEY = 'accessToken';

// In-flight registration promise, shared by concurrent ensureRegistered()
// callers so only one anonymous user is ever created per session.
let inFlightRegistration: Promise<string | null> | null = null;

// Chat messages are either ChatMessage or a type derived from SocketEvent
type ChatMessageType = ChatMessage | SocketEvent;

// A purchased screen effect waiting to be played by <ScreenEffects />.
// Consecutive purchases queue up and play one after another.
export interface ScreenEffectQueueItem {
	id: string;
	effectType: string;
	displayName: string;
	isAnonymous: boolean;
}

interface AppStore {
	// Server status
	serverStatus: ServerStatus;
	setServerStatus: (status: ServerStatus) => void;

	// Client config
	clientConfig: ClientConfig;
	setClientConfig: (config: ClientConfig) => void;

	// Access token
	accessToken: string | null;
	setAccessToken: (token: string | null) => void;
	// Lazily registers an anonymous chat user on first genuine intent (chat
	// input focus, opening the login modal) so passive viewers who only watch
	// never create a persistent user. Returns the current token if one already
	// exists, otherwise registers and returns the new token (null on failure).
	ensureRegistered: () => Promise<string | null>;

	// Current user
	currentUser: CurrentUser | null;
	setCurrentUser: (user: CurrentUser | null) => void;

	// Chat messages - supports any message type, including SocketEvent
	chatMessages: ChatMessageType[];
	setChatMessages: (
		messages: ChatMessageType[] | ((prev: ChatMessageType[]) => ChatMessageType[]),
	) => void;
	addChatMessage: (message: ChatMessageType) => void;
	clearChatMessages: () => void;

	// Chat authenticated
	chatAuthenticated: boolean;
	setChatAuthenticated: (authenticated: boolean) => void;

	// Websocket service
	websocketService: WebsocketService | null;
	setWebsocketService: (service: WebsocketService | null) => void;

	// App state
	appState: AppStateOptions;
	setAppState: (state: AppStateOptions) => void;

	// Mobile detection
	isMobile: boolean | undefined;
	setIsMobile: (isMobile: boolean | undefined) => void;

	// Chat visibility toggle
	chatVisibleToggle: boolean;
	setChatVisibleToggle: (visible: boolean) => void;

	// Video playing state
	isVideoPlaying: boolean;
	setIsVideoPlaying: (playing: boolean) => void;

	// Fatal error state
	fatalErrorState: DisplayableError | null;
	setFatalErrorState: (error: DisplayableError | null) => void;

	// Clock skew
	clockSkew: number;
	setClockSkew: (skew: number) => void;

	// Hidden message IDs
	hiddenMessageIds: string[];
	setHiddenMessageIds: (ids: string[] | ((prev: string[]) => string[])) => void;

	// Screen effect purchases waiting to be played, oldest first
	screenEffectQueue: ScreenEffectQueueItem[];
	enqueueScreenEffect: (item: ScreenEffectQueueItem) => void;
	dequeueScreenEffect: () => void;

	// Computed values (selectors)
	isChatAvailable: () => boolean;
	isChatVisible: () => boolean;
	isOnline: () => boolean;
	visibleChatMessages: () => ChatMessageType[];
}

// WebSocket disconnect flag
let hasWebsocketDisconnected = false;

export const setWebsocketDisconnected = (disconnected: boolean) => {
	hasWebsocketDisconnected = disconnected;
};

export const useAppStore = create<AppStore>()(
	subscribeWithSelector((set, get) => ({
		// Server status
		serverStatus: makeEmptyServerStatus(),
		setServerStatus: status => set({ serverStatus: status }),

		// Client config
		clientConfig: makeEmptyClientConfig(),
		setClientConfig: config => set({ clientConfig: config }),

		// Access token
		accessToken: null,
		setAccessToken: token => set({ accessToken: token }),
		ensureRegistered: async () => {
			const existing = get().accessToken;
			if (existing) {
				return existing;
			}
			// Deduplicate concurrent callers (e.g. chat focus + modal open) so a
			// single registration is shared instead of creating two users.
			if (!inFlightRegistration) {
				inFlightRegistration = (async () => {
					try {
						const res = await ChatService.registerUser('');
						if (res?.accessToken) {
							setLocalStorage(ACCESS_TOKEN_KEY, res.accessToken);
							set({
								accessToken: res.accessToken,
								currentUser: {
									id: res.id,
									displayName: res.displayName,
									displayColor: res.displayColor,
									isModerator: false,
								},
							});
							return res.accessToken;
						}
					} catch (e) {
						console.error('ensureRegistered failed:', e);
					} finally {
						inFlightRegistration = null;
					}
					return null;
				})();
			}
			return inFlightRegistration;
		},

		// Current user
		currentUser: null,
		setCurrentUser: user => set({ currentUser: user }),

		// Chat messages
		chatMessages: [],
		setChatMessages: messagesOrUpdater =>
			set(state => ({
				chatMessages:
					typeof messagesOrUpdater === 'function'
						? messagesOrUpdater(state.chatMessages)
						: messagesOrUpdater,
			})),
		addChatMessage: message =>
			set(state => ({
				chatMessages: [...state.chatMessages, message],
			})),
		clearChatMessages: () => set({ chatMessages: [] }),

		// Chat authenticated
		chatAuthenticated: false,
		setChatAuthenticated: authenticated => set({ chatAuthenticated: authenticated }),

		// Websocket service
		websocketService: null,
		setWebsocketService: service => set({ websocketService: service }),

		// App state
		appState: makeEmptyAppState(),
		setAppState: state => set({ appState: state }),

		// Mobile detection
		isMobile: undefined,
		setIsMobile: isMobile => set({ isMobile }),

		// Chat visibility toggle
		chatVisibleToggle: true,
		setChatVisibleToggle: visible => set({ chatVisibleToggle: visible }),

		// Video playing state
		isVideoPlaying: false,
		setIsVideoPlaying: playing => set({ isVideoPlaying: playing }),

		// Fatal error state
		fatalErrorState: null,
		setFatalErrorState: error => set({ fatalErrorState: error }),

		// Clock skew
		clockSkew: 0,
		setClockSkew: skew => set({ clockSkew: skew }),

		// Hidden message IDs
		hiddenMessageIds: [],
		setHiddenMessageIds: idsOrUpdater =>
			set(state => ({
				hiddenMessageIds:
					typeof idsOrUpdater === 'function' ? idsOrUpdater(state.hiddenMessageIds) : idsOrUpdater,
			})),

		// Screen effect queue
		screenEffectQueue: [],
		enqueueScreenEffect: item =>
			set(state => ({ screenEffectQueue: [...state.screenEffectQueue, item] })),
		dequeueScreenEffect: () =>
			set(state => ({ screenEffectQueue: state.screenEffectQueue.slice(1) })),

		// Computed values (selectors)
		isChatAvailable: () => {
			const state = get();
			return !!(state.accessToken && state.appState.chatAvailable && !hasWebsocketDisconnected);
		},

		isChatVisible: () => {
			const state = get();
			return state.appState.chatAvailable && state.chatVisibleToggle && !hasWebsocketDisconnected;
		},

		isOnline: () => {
			const state = get();
			return state.appState.videoAvailable || state.isVideoPlaying;
		},

		visibleChatMessages: () => {
			const state = get();
			return state.chatMessages.filter(message => !state.hiddenMessageIds.includes(message.id));
		},
	})),
);

// Convenience hooks for individual state slices
export const useServerStatus = () => useAppStore(state => state.serverStatus);
export const useSetServerStatus = () => useAppStore(state => state.setServerStatus);

export const useClientConfig = () => useAppStore(state => state.clientConfig);
export const useSetClientConfig = () => useAppStore(state => state.setClientConfig);

export const useAccessToken = () => useAppStore(state => state.accessToken);
export const useSetAccessToken = () => useAppStore(state => state.setAccessToken);
export const useEnsureRegistered = () => useAppStore(state => state.ensureRegistered);

export const useCurrentUser = () => useAppStore(state => state.currentUser);
export const useSetCurrentUser = () => useAppStore(state => state.setCurrentUser);

export const useChatMessages = () => useAppStore(state => state.chatMessages);
export const useSetChatMessages = () => useAppStore(state => state.setChatMessages);

export const useChatAuthenticated = () => useAppStore(state => state.chatAuthenticated);
export const useSetChatAuthenticated = () => useAppStore(state => state.setChatAuthenticated);

export const useWebsocketService = () => useAppStore(state => state.websocketService);
export const useSetWebsocketService = () => useAppStore(state => state.setWebsocketService);

export const useAppState = () => useAppStore(state => state.appState);
export const useSetAppState = () => useAppStore(state => state.setAppState);

export const useIsMobile = () => useAppStore(state => state.isMobile);
export const useSetIsMobile = () => useAppStore(state => state.setIsMobile);

export const useChatVisibleToggle = () => useAppStore(state => state.chatVisibleToggle);
export const useSetChatVisibleToggle = () => useAppStore(state => state.setChatVisibleToggle);

export const useIsVideoPlaying = () => useAppStore(state => state.isVideoPlaying);
export const useSetIsVideoPlaying = () => useAppStore(state => state.setIsVideoPlaying);

export const useFatalErrorState = () => useAppStore(state => state.fatalErrorState);
export const useSetFatalErrorState = () => useAppStore(state => state.setFatalErrorState);

export const useClockSkew = () => useAppStore(state => state.clockSkew);
export const useSetClockSkew = () => useAppStore(state => state.setClockSkew);

export const useHiddenMessageIds = () => useAppStore(state => state.hiddenMessageIds);
export const useSetHiddenMessageIds = () => useAppStore(state => state.setHiddenMessageIds);

export const useScreenEffectQueue = () => useAppStore(state => state.screenEffectQueue);
export const useEnqueueScreenEffect = () => useAppStore(state => state.enqueueScreenEffect);
export const useDequeueScreenEffect = () => useAppStore(state => state.dequeueScreenEffect);

// Computed selector hooks
export const useIsChatAvailable = () => useAppStore(state => state.isChatAvailable());
export const useIsChatVisible = () => useAppStore(state => state.isChatVisible());
export const useIsOnline = () => useAppStore(state => state.isOnline());
export const useVisibleChatMessages = () => useAppStore(state => state.visibleChatMessages());
