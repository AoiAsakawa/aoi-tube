import { User } from './user.model';

export enum MessageType {
	CHAT = 'CHAT',
	PING = 'PING',
	NAME_CHANGE = 'NAME_CHANGE',
	COLOR_CHANGE = 'COLOR_CHANGE',
	PONG = 'PONG',
	SYSTEM = 'SYSTEM',
	USER_JOINED = 'USER_JOINED',
	USER_PARTED = 'USER_PARTED',
	CHAT_ACTION = 'CHAT_ACTION',
	FEDIVERSE_ENGAGEMENT_FOLLOW = 'FEDIVERSE_ENGAGEMENT_FOLLOW',
	FEDIVERSE_ENGAGEMENT_LIKE = 'FEDIVERSE_ENGAGEMENT_LIKE',
	FEDIVERSE_ENGAGEMENT_REPOST = 'FEDIVERSE_ENGAGEMENT_REPOST',
	CONNECTED_USER_INFO = 'CONNECTED_USER_INFO',
	ERROR_USER_DISABLED = 'ERROR_USER_DISABLED',
	ERROR_NEEDS_REGISTRATION = 'ERROR_NEEDS_REGISTRATION',
	ERROR_MAX_CONNECTIONS_EXCEEDED = 'ERROR_MAX_CONNECTIONS_EXCEEDED',
	VISIBILITY_UPDATE = 'VISIBILITY-UPDATE',
	DONATION = 'DONATION',
}

export interface SocketEvent {
	id: string;
	timestamp: Date;
	type: MessageType;
}

export interface ConnectedClientInfoEvent extends SocketEvent {
	user: User;
}
export class ChatEvent implements SocketEvent {
	constructor(message) {
		this.id = message.id;
		this.timestamp = message.timestamp;
		this.type = message.type;
		this.body = message.body;
		this.translationKey = message.translationKey;
		this.translationVars = message.translationVars;
		if (message.user) {
			this.user = new User(message.user);
		}
	}

	timestamp: Date;

	type: MessageType;

	id: string;

	user: User;

	body: string;

	// Server-sent system actions carry a translation key so the client can
	// render them in the viewer's language; body is the fallback.
	translationKey?: string;

	translationVars?: Record<string, string>;
}

export interface NameChangeEvent extends SocketEvent {
	user: User;
	oldName: string;
}

export interface MessageVisibilityEvent extends SocketEvent {
	visible: boolean;
	ids: string[];
}

export interface FediverseEvent extends SocketEvent {
	title: string;
	image: string;
	link: string;
	body: string;
}

export interface DonationSocketEvent extends SocketEvent {
	amount: number;
	currency: string;
	// JPY value recorded by the server at confirmation time (crypto purchases
	// only); 0 or missing means no conversion was available.
	amountJpy?: number;
	message?: string;
	displayName: string;
	isAnonymous: boolean;
	donationId: string;
	user?: User;
	// What was purchased: "superchat" (default) or "effect".
	// Older events / superchats may omit this field entirely.
	itemType?: string;
	// The screen effect purchased when itemType is "effect".
	effectType?: string;
}
