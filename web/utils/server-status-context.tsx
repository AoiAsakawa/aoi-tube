// TODO: add a notication after updating info that changes will take place either on a new stream or server restart. may be different for each field.

import React, { useState, useEffect, useMemo, FC, ReactElement } from 'react';

import { STATUS, fetchData, FETCH_INTERVAL, SERVER_CONFIG } from './apis';
import { ConfigDetails, UpdateArgs } from '../types/config-section';
import { DEFAULT_VARIANT_STATE } from './config-constants';

const initialServerConfigState: ConfigDetails = {
	streamKeys: [],
	streamKeyOverridden: false,
	adminPassword: '',
	instanceDetails: {
		customStyles: '',
		customJavascript: '',
		extraPageContent: '',
		logo: '',
		name: '',
		nsfw: false,
		socialHandles: [],
		streamTitle: '',
		summary: '',
		tags: [],
		title: '',
		welcomeMessage: '',
		offlineMessage: '',
		streamSchedule: '',
		appearanceVariables: {},
	},
	ffmpegPath: '',
	rtmpServerPort: '',
	webServerPort: '',
	socketHostOverride: null,
	s3: {
		accessKey: '',
		acl: '',
		bucket: '',
		enabled: false,
		endpoint: '',
		region: '',
		secret: '',
		servingEndpoint: '',
		forcePathStyle: false,
	},
	rtmps: {
		enabled: false,
		port: 1936,
		certPath: '',
		keyPath: '',
	},
	yp: {
		enabled: false,
		instanceUrl: '',
	},
	videoSettings: {
		latencyLevel: 4,
		cpuUsageLevel: 3,
		videoQualityVariants: [DEFAULT_VARIANT_STATE],
	},
	federation: {
		enabled: false,
		isPrivate: false,
		username: '',
		goLiveMessage: '',
		showEngagement: true,
		blockedDomains: [],
	},
	notifications: {
		browser: { enabled: false, goLiveMessage: '' },
		discord: { enabled: false, webhook: '', goLiveMessage: '' },
		twitter: {
			enabled: false,
			consumerKey: '',
			consumerSecret: '',
			accessToken: '',
			accessTokenSecret: '',
			goLiveMessage: '',
			hashtags: '',
			includeTitle: true,
			includeServerName: true,
		},
	},
	externalActions: [],
	supportedCodecs: [],
	videoCodec: '',
	forbiddenUsernames: [],
	suggestedUsernames: [],
	chatDisabled: false,
	silentStreamMode: false,
	chatJoinMessagesEnabled: true,
	chatEstablishedUserMode: false,
	chatSpamProtectionEnabled: true,
	chatSlurFilterEnabled: false,
	requireTwitterAuth: false,
	hideViewerCount: false,
	recordingEnabled: false,
	recordingStoreOnS3: false,
	backupEnabled: true,
	backupIntervalHours: 24,
	backupRetentionCount: 7,
	backupStoreOnS3: false,
	recordingRetentionCount: 0,
	discordAuth: {
		clientId: '',
		clientSecret: '',
	},
	xAuth: {
		clientId: '',
		clientSecret: '',
	},
	googleAuth: {
		clientId: '',
		clientSecret: '',
	},
	githubAuth: {
		clientId: '',
		clientSecret: '',
	},
};

const initialServerStatusState = {
	broadcastActive: false,
	broadcaster: null,
	currentBroadcast: null,
	online: false,
	viewerCount: 0,
	sessionMaxViewerCount: 0,
	sessionPeakViewerCount: 0,
	overallPeakViewerCount: 0,
	versionNumber: '0.0.0',
	streamTitle: '',
	chatDisabled: false,
	health: {
		healthy: true,
		healthPercentage: 100,
		message: '',
		representation: 0,
	},
	error: {
		type: null,
		msg: null,
	},
};

export const ServerStatusContext = React.createContext({
	...initialServerStatusState,
	serverConfig: initialServerConfigState,

	setFieldInConfigState: (_args: UpdateArgs) => null,
});

export type ServerStatusProviderProps = {
	children: ReactElement;
};

const ServerStatusProvider: FC<ServerStatusProviderProps> = ({ children }) => {
	const [status, setStatus] = useState(initialServerStatusState);
	const [config, setConfig] = useState(initialServerConfigState);

	const getStatus = async () => {
		try {
			const result = await fetchData(STATUS);

			if (result instanceof Error) {
				throw result;
			}

			setStatus({ ...result, error: { type: null, msg: null } });
		} catch (_error) {
			setStatus(initialStatus => ({
				...initialStatus,
				error: {
					type: 'OWNCAST_SERVICE_UNREACHABLE',
					msg: 'サーバーに接続できません。インターネット接続を確認し、サーバーが起動していることを確認してください。',
				},
			}));
			// todo
		}
	};
	const getConfig = async () => {
		try {
			const result = await fetchData(SERVER_CONFIG);

			if (result instanceof Error) {
				throw result;
			}

			setConfig(result);
		} catch (error) {
			console.error(error);
		}
	};

	const setFieldInConfigState = ({ fieldName, value, path }: UpdateArgs) => {
		const updatedConfig = path
			? {
					...config,
					[path]: {
						...config[path],
						[fieldName]: value,
					},
				}
			: {
					...config,
					[fieldName]: value,
				};
		setConfig(updatedConfig);
	};

	useEffect(() => {
		let getStatusIntervalId = null;

		getStatus();
		getStatusIntervalId = setInterval(getStatus, FETCH_INTERVAL);

		getConfig();

		// returned function will be called on component unmount
		return () => {
			clearInterval(getStatusIntervalId);
		};
	}, []);

	const providerValue = useMemo(
		() => ({
			...status,
			serverConfig: config,
			setFieldInConfigState,
		}),
		[status, config],
	);
	return (
		<ServerStatusContext.Provider value={providerValue}>{children}</ServerStatusContext.Provider>
	);
};

export default ServerStatusProvider;
