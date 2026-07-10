export interface ClientConfig {
	name: string;
	title?: string;
	summary: string;
	offlineMessage?: string;
	offlineMediaUrl?: string;
	offlineMediaType?: string;
	// Operator's free-text next-stream schedule note, shown on the offline screen.
	streamSchedule?: string;
	logo: string;
	tags: string[];
	version: string;
	nsfw: boolean;
	extraPageContent: string;
	socialHandles: SocialHandle[];
	chatDisabled: boolean;
	externalActions: any[];
	customStyles: string;
	appearanceVariables: Map<string, string>;
	maxSocketPayloadSize: number;
	federation: Federation;
	notifications: Notifications;
	authentication: Authentication;
	socketHostOverride?: string;
}

interface Authentication {
	indieAuthEnabled: boolean;
	twitterAuthEnabled: boolean;
	requireTwitterAuth: boolean;
	discordAuthEnabled: boolean;
	xAuthEnabled: boolean;
	googleAuthEnabled: boolean;
	githubAuthEnabled: boolean;
}

interface Federation {
	enabled: boolean;
	account: string;
	followerCount: number;
}

interface Notifications {
	browser: Browser;
}

interface Browser {
	enabled: boolean;
	publicKey: string;
}

interface SocialHandle {
	platform: string;
	url: string;
	icon: string;
}

export function makeEmptyClientConfig(): ClientConfig {
	return {
		name: '',
		summary: '',
		offlineMessage: '',
		offlineMediaUrl: '',
		offlineMediaType: '',
		logo: '',
		tags: [],
		version: '',
		nsfw: false,
		extraPageContent: '',
		socialHandles: [],
		chatDisabled: false,
		externalActions: [],
		customStyles: '',
		appearanceVariables: new Map(),
		maxSocketPayloadSize: 0,
		federation: {
			enabled: false,
			account: '',
			followerCount: 0,
		},
		notifications: {
			browser: {
				enabled: false,
				publicKey: '',
			},
		},
		authentication: {
			indieAuthEnabled: false,
			twitterAuthEnabled: false,
			requireTwitterAuth: false,
			discordAuthEnabled: false,
			xAuthEnabled: false,
			googleAuthEnabled: false,
			githubAuthEnabled: false,
		},
	};
}
