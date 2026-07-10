// DEFAULT VALUES
import { fetchData, SERVER_CONFIG_UPDATE_URL } from './apis';
import { ApiPostArgs, VideoVariant, SocialHandle } from '../types/config-section';
import { DEFAULT_TEXTFIELD_URL_PATTERN } from './validators';

// NOTE: User-facing strings in this module are i18n keys under `admin.fields.*`.
// They are resolved at render time with `t(value, { defaultValue: value })` by
// the shared form components (TextField, TextFieldWithSubmit, ToggleSwitch,
// EditValueArray, FormStatusIndicator) and by components that render these
// constants directly. Plain (non-key) strings continue to render unchanged.

const TEXT_MAXLENGTH = 255;

export const RESET_TIMEOUT = 3000;

// CONFIG API ENDPOINTS
export const API_CUSTOM_CONTENT = '/pagecontent';
export const API_CUSTOM_CSS_STYLES = '/customstyles';
export const API_CUSTOM_JAVASCRIPT = '/customjavascript';
export const API_S3_INFO = '/s3';
export const API_SERVER_OFFLINE_MESSAGE = '/offlinemessage';
export const API_STREAM_SCHEDULE = '/streamschedule';
export const API_COIN_WALLET_ENABLED = '/coinwallet/enabled';
export const API_COIN_CHARGE_BONUS_PERCENT = '/coinwallet/bonuspercent';
export const API_OFFLINE_CLIP = '/offlineclip';
export const API_OFFLINE_CLIP_RESET = '/offlineclip/reset';
export const API_OFFLINE_MEDIA = '/offlinemedia';
export const API_OFFLINE_MEDIA_RESET = '/offlinemedia/reset';
export const API_NOTIFICATION_THUMBNAIL = '/notificationthumbnail';
export const API_NOTIFICATION_THUMBNAIL_RESET = '/notificationthumbnail/reset';
export const API_SOCIAL_HANDLES = '/socialhandles';
export const API_VIDEO_SEGMENTS = '/video/streamlatencylevel';
export const API_VIDEO_VARIANTS = '/video/streamoutputvariants';
export const API_YP_SWITCH = '/directoryenabled';
export const API_CHAT_FORBIDDEN_USERNAMES = '/chat/forbiddenusernames';
export const API_CHAT_SUGGESTED_USERNAMES = '/chat/suggestedusernames';
export const API_EXTERNAL_ACTIONS = '/externalactions';
export const API_VIDEO_CODEC = '/video/codec';

const API_FFMPEG = '/ffmpegpath';
const API_INSTANCE_URL = '/serverurl';
const API_LOGO = '/logo';
const API_NSFW_SWITCH = '/nsfw';
const API_RTMP_PORT = '/rtmpserverport';
const API_SERVER_SUMMARY = '/serversummary';
const API_SERVER_WELCOME_MESSAGE = '/welcomemessage';
const API_SERVER_NAME = '/name';
const API_STREAM_KEY = '/adminpass';
const API_STREAM_TITLE = '/streamtitle';
const API_TAGS = '/tags';
const API_WEB_PORT = '/webserverport';
const API_HIDE_VIEWER_COUNT = '/hideviewercount';
const API_CHAT_DISABLE = '/chat/disable';
const API_SILENT_STREAM_MODE = '/silentstreammode';
const API_RECORDING_ENABLED = '/recordingenabled';
const API_RECORDING_STORE_S3 = '/recordingstores3';
const API_CHAT_JOIN_MESSAGES_ENABLED = '/chat/joinmessagesenabled';
const API_CHAT_ESTABLISHED_MODE = '/chat/establishedusermode';
const API_CHAT_REQUIRE_TWITTER_AUTH = '/chat/requiretwitterauth';

const API_SOCKET_HOST_OVERRIDE = '/sockethostoverride';

// Federation
const API_FEDERATION_ENABLED = '/federation/enable';
const API_FEDERATION_PRIVATE = '/federation/private';
const API_FEDERATION_USERNAME = '/federation/username';
const API_FEDERATION_GOLIVE_MESSAGE = '/federation/livemessage';
const API_FEDERATION_SHOW_ENGAGEMENT = '/federation/showengagement';
export const API_FEDERATION_BLOCKED_DOMAINS = '/federation/blockdomains';

const TEXTFIELD_TYPE_URL = 'url';

export async function postConfigUpdateToAPI(args: ApiPostArgs) {
	const { apiPath, data, onSuccess, onError } = args;
	const result = await fetchData(`${SERVER_CONFIG_UPDATE_URL}${apiPath}`, {
		data,
		method: 'POST',
		auth: true,
	});
	if (result.success && onSuccess) {
		onSuccess(result.message);
	} else if (onError) {
		onError(result.message);
	}
}

// Some default props to help build out a TextField
export const TEXTFIELD_PROPS_SERVER_NAME = {
	apiPath: API_SERVER_NAME,
	configPath: 'instanceDetails',
	maxLength: TEXT_MAXLENGTH,
	placeholder: 'admin.fields.serverName.placeholder', // like "gothland"
	label: 'admin.fields.serverName.label',
	tip: 'admin.fields.serverName.tip',
	required: true,
	useTrimLead: true,
};
export const TEXTFIELD_PROPS_STREAM_TITLE = {
	apiPath: API_STREAM_TITLE,
	configPath: 'instanceDetails',
	maxLength: 100,
	placeholder: 'admin.fields.streamTitle.placeholder',
	label: 'admin.fields.streamTitle.label',
	tip: 'admin.fields.streamTitle.tip',
};
export const TEXTFIELD_PROPS_SERVER_SUMMARY = {
	apiPath: API_SERVER_SUMMARY,
	configPath: 'instanceDetails',
	maxLength: 500,
	placeholder: '',
	label: 'admin.fields.serverSummary.label',
	tip: 'admin.fields.serverSummary.tip',
};
export const TEXTFIELD_PROPS_SERVER_OFFLINE_MESSAGE = {
	apiPath: API_SERVER_OFFLINE_MESSAGE,
	configPath: 'instanceDetails',
	maxLength: 2500,
	placeholder: 'admin.fields.offlineMessage.placeholder',
	label: 'admin.fields.offlineMessage.label',
	tip: 'admin.fields.offlineMessage.tip',
};
export const TEXTFIELD_PROPS_STREAM_SCHEDULE = {
	apiPath: API_STREAM_SCHEDULE,
	configPath: 'instanceDetails',
	maxLength: 255,
	placeholder: 'admin.fields.streamSchedule.placeholder',
	label: 'admin.fields.streamSchedule.label',
	tip: 'admin.fields.streamSchedule.tip',
};
export const TEXTFIELD_PROPS_SERVER_WELCOME_MESSAGE = {
	apiPath: API_SERVER_WELCOME_MESSAGE,
	configPath: 'instanceDetails',
	maxLength: 2500,
	placeholder: '',
	label: 'admin.fields.welcomeMessage.label',
	tip: 'admin.fields.welcomeMessage.tip',
};
export const TEXTFIELD_PROPS_LOGO = {
	apiPath: API_LOGO,
	configPath: 'instanceDetails',
	maxLength: 255,
	placeholder: '/img/mylogo.png',
	label: 'admin.fields.logo.label',
	tip: 'admin.fields.logo.tip',
};
export const TEXTFIELD_PROPS_LIVE_POSTER = {
	apiPath: '/liveposter',
	configPath: '',
	label: 'admin.fields.livePoster.label',
	tip: 'admin.fields.livePoster.tip',
};
export const TEXTFIELD_PROPS_ADMIN_PASSWORD = {
	apiPath: API_STREAM_KEY,
	configPath: '',
	maxLength: TEXT_MAXLENGTH,
	placeholder: 'abc123',
	label: 'admin.fields.adminPassword.label',
	tip: 'admin.fields.adminPassword.tip',
	required: true,
	hasComplexityRequirements: true,
};
export const TEXTFIELD_PROPS_FFMPEG = {
	apiPath: API_FFMPEG,
	configPath: '',
	maxLength: TEXT_MAXLENGTH,
	placeholder: '/usr/local/bin/ffmpeg',
	label: 'admin.fields.ffmpegPath.label',
	tip: 'admin.fields.ffmpegPath.tip',
	required: true,
	hasComplexityRequirements: false,
};
export const TEXTFIELD_PROPS_WEB_PORT = {
	apiPath: API_WEB_PORT,
	configPath: '',
	maxLength: 6,
	placeholder: '8080',
	label: 'admin.fields.webPort.label',
	tip: 'admin.fields.webPort.tip',
	required: true,
	hasComplexityRequirements: false,
};
export const TEXTFIELD_PROPS_RTMP_PORT = {
	apiPath: API_RTMP_PORT,
	configPath: '',
	maxLength: 6,
	placeholder: '1935',
	label: 'admin.fields.rtmpPort.label',
	tip: 'admin.fields.rtmpPort.tip',
	required: true,
	hasComplexityRequirements: false,
};
export const TEXTFIELD_PROPS_INSTANCE_URL = {
	apiPath: API_INSTANCE_URL,
	configPath: 'yp',
	maxLength: 255,
	placeholder: 'https://owncast.mysite.com',
	label: 'admin.fields.instanceUrl.label',
	tip: 'admin.fields.instanceUrl.tip',
	type: TEXTFIELD_TYPE_URL,
	pattern: DEFAULT_TEXTFIELD_URL_PATTERN,
	useTrim: true,
};

export const TEXTFIELD_PROPS_SOCKET_HOST_OVERRIDE = {
	apiPath: API_SOCKET_HOST_OVERRIDE,
	configPath: '',
	maxLength: 255,
	placeholder: 'https://owncast.mysite.com',
	label: 'admin.fields.socketHostOverride.label',
	tip: 'admin.fields.socketHostOverride.tip',
	type: TEXTFIELD_TYPE_URL,
	pattern: DEFAULT_TEXTFIELD_URL_PATTERN,
	useTrim: true,
};

// MISC FIELDS
export const FIELD_PROPS_TAGS = {
	apiPath: API_TAGS,
	configPath: 'instanceDetails',
	maxLength: 24,
	placeholder: 'admin.fields.tags.placeholder',
	required: true,
	label: '',
	tip: '',
};

export const FIELD_PROPS_NSFW = {
	apiPath: API_NSFW_SWITCH,
	configPath: 'instanceDetails',
	label: 'admin.fields.nsfw.label',
	tip: 'admin.fields.nsfw.tip',
};

export const FIELD_PROPS_YP = {
	apiPath: API_YP_SWITCH,
	configPath: 'yp',
	label: 'admin.fields.directoryEnabled.label',
	tip: 'admin.fields.directoryEnabled.tip',
};

export const FIELD_PROPS_HIDE_VIEWER_COUNT = {
	apiPath: API_HIDE_VIEWER_COUNT,
	configPath: '',
	label: 'admin.fields.hideViewerCount.label',
	tip: 'admin.fields.hideViewerCount.tip',
};

export const DEFAULT_VARIANT_STATE: VideoVariant = {
	framerate: 24,
	videoPassthrough: false,
	videoBitrate: 1200,
	audioPassthrough: true, // if false, then CAN set audiobitrate
	audioBitrate: 0,
	cpuUsageLevel: 2,
	scaledHeight: null,
	scaledWidth: null,
	name: '',
};

export const FIELD_PROPS_SILENT_STREAM_MODE = {
	apiPath: API_SILENT_STREAM_MODE,
	configPath: '',
	label: 'admin.fields.silentStreamMode.label',
	tip: 'admin.fields.silentStreamMode.tip',
	useSubmit: true,
};

export const FIELD_PROPS_RECORDING_ENABLED = {
	apiPath: API_RECORDING_ENABLED,
	configPath: '',
	label: 'admin.fields.recordingEnabled.label',
	tip: 'admin.fields.recordingEnabled.tip',
	useSubmit: true,
};

export const FIELD_PROPS_RECORDING_STORE_S3 = {
	apiPath: API_RECORDING_STORE_S3,
	configPath: '',
	label: 'admin.fields.recordingStoreS3.label',
	tip: 'admin.fields.recordingStoreS3.tip',
	useSubmit: true,
};

export const FIELD_PROPS_BACKUP_ENABLED = {
	apiPath: '/backupenabled',
	configPath: '',
	label: 'admin.fields.backupEnabled.label',
	tip: 'admin.fields.backupEnabled.tip',
	useSubmit: true,
};

export const FIELD_PROPS_BACKUP_STORE_S3 = {
	apiPath: '/backupstores3',
	configPath: '',
	label: 'admin.fields.backupStoreS3.label',
	tip: 'admin.fields.backupStoreS3.tip',
	useSubmit: true,
};

export const TEXTFIELD_PROPS_BACKUP_INTERVAL = {
	apiPath: '/backupinterval',
	configPath: '',
	maxLength: 5,
	placeholder: '24',
	label: 'admin.fields.backupInterval.label',
	tip: 'admin.fields.backupInterval.tip',
};

export const TEXTFIELD_PROPS_BACKUP_RETENTION = {
	apiPath: '/backupretention',
	configPath: '',
	maxLength: 4,
	placeholder: '7',
	label: 'admin.fields.backupRetention.label',
	tip: 'admin.fields.backupRetention.tip',
};

export const TEXTFIELD_PROPS_RECORDING_RETENTION = {
	apiPath: '/recordingretention',
	configPath: '',
	maxLength: 4,
	placeholder: '0',
	label: 'admin.fields.recordingRetention.label',
	tip: 'admin.fields.recordingRetention.tip',
};

export const FIELD_PROPS_DISABLE_CHAT = {
	apiPath: API_CHAT_DISABLE,
	configPath: '',
	label: 'admin.fields.chatDisable.label',
	tip: 'admin.fields.chatDisable.tip',
	useSubmit: true,
};

export const FIELD_PROPS_CHAT_JOIN_MESSAGES_ENABLED = {
	apiPath: API_CHAT_JOIN_MESSAGES_ENABLED,
	configPath: '',
	label: 'admin.fields.chatJoinMessages.label',
	tip: 'admin.fields.chatJoinMessages.tip',
	useSubmit: true,
};

export const CHAT_ESTABLISHED_USER_MODE = {
	apiPath: API_CHAT_ESTABLISHED_MODE,
	configPath: '',
	label: 'admin.fields.chatEstablishedUsers.label',
	tip: 'admin.fields.chatEstablishedUsers.tip',
	useSubmit: true,
};

export const FIELD_PROPS_ENABLE_SPAM_PROTECTION = {
	apiPath: '/chat/spamprotectionenabled',
	configPath: '',
	label: 'admin.fields.chatSpamProtection.label',
	tip: 'admin.fields.chatSpamProtection.tip',
	useSubmit: true,
};

export const FIELD_PROPS_ENABLE_CHAT_SLUR_FILTER = {
	apiPath: '/chat/slurfilterenabled',
	configPath: '',
	label: 'admin.fields.chatSlurFilter.label',
	tip: 'admin.fields.chatSlurFilter.tip',
	useSubmit: true,
};

export const REQUIRE_TWITTER_AUTH = {
	apiPath: API_CHAT_REQUIRE_TWITTER_AUTH,
	configPath: '',
	label: 'admin.fields.requireSocialAuth.label',
	tip: 'admin.fields.requireSocialAuth.tip',
	useSubmit: true,
};

export const TEXTFIELD_PROPS_CHAT_FORBIDDEN_USERNAMES = {
	apiPath: API_CHAT_FORBIDDEN_USERNAMES,
	placeholder: 'admin.fields.forbiddenUsernames.placeholder',
	label: 'admin.fields.forbiddenUsernames.label',
	tip: 'admin.fields.forbiddenUsernames.tip',
};

export const TEXTFIELD_PROPS_CHAT_SUGGESTED_USERNAMES = {
	apiPath: API_CHAT_SUGGESTED_USERNAMES,
	placeholder: 'admin.fields.suggestedUsernames.placeholder',
	label: 'admin.fields.suggestedUsernames.label',
	tip: 'admin.fields.suggestedUsernames.tip',
	min_not_reached: 'admin.fields.suggestedUsernames.minNotReached',
	no_entries: 'admin.fields.suggestedUsernames.noEntries',
};

export const FIELD_PROPS_ENABLE_FEDERATION = {
	apiPath: API_FEDERATION_ENABLED,
	configPath: 'federation',
	label: 'admin.fields.federationEnabled.label',
	tip: 'admin.fields.federationEnabled.tip',
	useSubmit: true,
};

export const FIELD_PROPS_FEDERATION_IS_PRIVATE = {
	apiPath: API_FEDERATION_PRIVATE,
	configPath: 'federation',
	label: 'admin.fields.federationPrivate.label',
	tip: 'admin.fields.federationPrivate.tip',
	useSubmit: true,
};

export const FIELD_PROPS_SHOW_FEDERATION_ENGAGEMENT = {
	apiPath: API_FEDERATION_SHOW_ENGAGEMENT,
	configPath: 'showEngagement',
	label: 'admin.fields.federationShowEngagement.label',
	tip: 'admin.fields.federationShowEngagement.tip',
	useSubmit: true,
};

export const TEXTFIELD_PROPS_FEDERATION_LIVE_MESSAGE = {
	apiPath: API_FEDERATION_GOLIVE_MESSAGE,
	configPath: 'federation',
	maxLength: 500,
	placeholder: 'admin.fields.federationLiveMessage.placeholder',
	label: 'admin.fields.federationLiveMessage.label',
	tip: 'admin.fields.federationLiveMessage.tip',
};

export const TEXTFIELD_PROPS_FEDERATION_DEFAULT_USER = {
	apiPath: API_FEDERATION_USERNAME,
	configPath: 'federation',
	maxLength: 10,
	placeholder: 'owncast',
	default: 'owncast',
	label: 'admin.fields.federationDefaultUser.label',
	tip: 'admin.fields.federationDefaultUser.tip',
};

export const TEXTFIELD_PROPS_FEDERATION_INSTANCE_URL = {
	apiPath: API_INSTANCE_URL,
	configPath: 'yp',
	maxLength: 255,
	placeholder: 'https://owncast.mysite.com',
	label: 'admin.fields.federationInstanceUrl.label',
	tip: 'admin.fields.federationInstanceUrl.tip',
	type: TEXTFIELD_TYPE_URL,
	pattern: DEFAULT_TEXTFIELD_URL_PATTERN,
	useTrim: true,
};

export const FIELD_PROPS_FEDERATION_NSFW = {
	apiPath: API_NSFW_SWITCH,
	configPath: 'instanceDetails',
	label: 'admin.fields.federationNsfw.label',
	tip: 'admin.fields.federationNsfw.tip',
};

export const FIELD_PROPS_FEDERATION_BLOCKED_DOMAINS = {
	apiPath: API_FEDERATION_BLOCKED_DOMAINS,
	configPath: 'federation',
	label: 'admin.fields.federationBlockedDomains.label',
	placeholder: 'bad.domain.biz',
	tip: 'admin.fields.federationBlockedDomains.tip',
};

export const VIDEO_VARIANT_SETTING_DEFAULTS = {
	// this one is currently unused
	audioBitrate: {
		min: 600,
		max: 1200,
		defaultValue: 800,
		unit: 'kbps',
		incrementBy: 100,
		tip: 'nothing to see here',
	},
	videoPassthrough: {
		tip: 'admin.fields.videoVariant.videoPassthroughTip',
	},
	audioPassthrough: {
		tip: 'admin.fields.videoVariant.audioPassthroughTip',
	},
	scaledWidth: {
		fieldName: 'scaledWidth',
		label: 'admin.fields.videoVariant.scaledWidth.label',
		maxLength: 4,
		placeholder: '1280',
		tip: 'admin.fields.videoVariant.scaledWidth.tip',
	},
	scaledHeight: {
		fieldName: 'scaledHeight',
		label: 'admin.fields.videoVariant.scaledHeight.label',
		maxLength: 4,
		placeholder: '720',
		tip: 'admin.fields.videoVariant.scaledHeight.tip',
	},
};

// VIDEO VARIANT FORM - framerate
export const FRAMERATE_DEFAULTS = {
	min: 24,
	max: 120,
	defaultValue: 24,
	unit: 'fps',
	incrementBy: null,
	tip: 'admin.fields.framerate.tip',
};
export const FRAMERATE_SLIDER_MARKS = {
	[FRAMERATE_DEFAULTS.min]: `${FRAMERATE_DEFAULTS.min} ${FRAMERATE_DEFAULTS.unit}`,
	25: ' ',
	30: ' ',
	50: ' ',
	60: ' ',
	90: ' ',
	[FRAMERATE_DEFAULTS.max]: `${FRAMERATE_DEFAULTS.max} ${FRAMERATE_DEFAULTS.unit}`,
};
// The key names (fps24 etc.) match FRAMERATE_DEFAULTS.min (24) and .max (120).
export const FRAMERATE_TOOLTIPS = {
	[FRAMERATE_DEFAULTS.min]: 'admin.fields.framerate.tooltips.fps24',
	25: 'admin.fields.framerate.tooltips.fps25',
	30: 'admin.fields.framerate.tooltips.fps30',
	50: 'admin.fields.framerate.tooltips.fps50',
	60: 'admin.fields.framerate.tooltips.fps60',
	90: 'admin.fields.framerate.tooltips.fps90',
	[FRAMERATE_DEFAULTS.max]: 'admin.fields.framerate.tooltips.fps120',
};
// VIDEO VARIANT FORM - bitrate
export const VIDEO_BITRATE_DEFAULTS = {
	min: 400,
	max: 6000,
	defaultValue: 1200,
	unit: 'kbps',
	incrementBy: 100,
	tip: 'admin.fields.videoBitrate.tip',
};

export const VIDEO_NAME_DEFAULTS = {
	fieldName: 'name',
	label: 'admin.fields.videoVariant.name.label',
	maxLength: 15,
	placeholder: 'admin.fields.videoVariant.name.placeholder',
	tip: 'admin.fields.videoVariant.name.tip',
};

export const VIDEO_BITRATE_SLIDER_MARKS = {
	[VIDEO_BITRATE_DEFAULTS.min]: {
		style: {
			marginLeft: '24px',
		},
		label: `${VIDEO_BITRATE_DEFAULTS.min} ${VIDEO_BITRATE_DEFAULTS.unit}`,
	},
	3000: 3000,
	4500: 4500,
	[VIDEO_BITRATE_DEFAULTS.max]: {
		style: {
			marginLeft: '-10px',
		},
		label: `${VIDEO_BITRATE_DEFAULTS.max} ${VIDEO_BITRATE_DEFAULTS.unit}`,
	},
};
// VIDEO VARIANT FORM - encoder preset
// CPU
export const ENCODER_PRESET_SLIDER_MARKS = {
	0: {
		style: {
			marginLeft: '15px',
		},
		label: 'admin.fields.encoderPreset.lowest',
	},
	1: ' ',
	2: ' ',
	3: ' ',
	4: {
		style: {
			marginLeft: '-15px',
		},
		label: 'admin.fields.encoderPreset.highest',
	},
};
export const ENCODER_PRESET_TOOLTIPS = {
	0: 'admin.fields.encoderPreset.tooltips.level0',
	1: 'admin.fields.encoderPreset.tooltips.level1',
	2: 'admin.fields.encoderPreset.tooltips.level2',
	3: 'admin.fields.encoderPreset.tooltips.level3',
	4: 'admin.fields.encoderPreset.tooltips.level4',
};

export const ENCODER_RECOMMENDATION_THRESHOLD = {
	VIDEO_HEIGHT: 1080,
	VIDEO_BITRATE: 3000,
	HELP_TEXT: 'admin.fields.encoderRecommendation.helpText',
};

export const DEFAULT_SOCIAL_HANDLE: SocialHandle = {
	url: '',
	platform: '',
};

export const OTHER_SOCIAL_HANDLE_OPTION = 'OTHER_SOCIAL_HANDLE_OPTION';

export const S3_TEXT_FIELDS_INFO = {
	accessKey: {
		fieldName: 'accessKey',
		label: 'Access Key',
		maxLength: 255,
		placeholder: 'access key 123',
		tip: '',
	},
	acl: {
		fieldName: 'acl',
		label: 'ACL',
		maxLength: 255,
		placeholder: '',
		tip: 'Optional specific access control value to add to your content.  Generally not required.',
	},
	bucket: {
		fieldName: 'bucket',
		label: 'Bucket',
		maxLength: 255,
		placeholder: 'bucket 123',
		tip: 'Create a new bucket for each AoiTube instance you may be running.',
	},
	endpoint: {
		fieldName: 'endpoint',
		label: 'Endpoint',
		maxLength: 255,
		placeholder: 'https://your.s3.provider.endpoint.com',
		tip: 'The full URL (with "https://") endpoint from your storage provider.',
		useTrim: true,
		type: TEXTFIELD_TYPE_URL,
		pattern: DEFAULT_TEXTFIELD_URL_PATTERN,
	},
	region: {
		fieldName: 'region',
		label: 'admin.fields.s3.region.label',
		maxLength: 255,
		placeholder: 'ap-northeast-1',
		tip: '',
	},
	secret: {
		fieldName: 'secret',
		label: 'admin.fields.s3.secret.label',
		maxLength: 255,
		placeholder: 'admin.fields.s3.secret.placeholder',
		tip: '',
	},
	servingEndpoint: {
		fieldName: 'servingEndpoint',
		label: 'admin.fields.s3.servingEndpoint.label',
		maxLength: 255,
		placeholder: 'http://cdn.ss3.provider.endpoint.com',
		tip: 'admin.fields.s3.servingEndpoint.tip',
		type: TEXTFIELD_TYPE_URL,
		pattern: DEFAULT_TEXTFIELD_URL_PATTERN,
		useTrim: true,
	},
	forcePathStyle: {
		fieldName: 'forcePathStyle',
		label: 'admin.fields.s3.forcePathStyle.label',
		tip: 'admin.fields.s3.forcePathStyle.tip',
	},
};

export const DISCORD_CONFIG_FIELDS = {
	webhookUrl: {
		fieldName: 'webhook',
		label: 'Webhook URL',
		maxLength: 255,
		placeholder: 'https://discord.com/api/webhooks/837/jf38-6iNEv',
		tip: 'admin.fields.discord.webhookUrl.tip',
		type: TEXTFIELD_TYPE_URL,
		pattern: DEFAULT_TEXTFIELD_URL_PATTERN,
		useTrim: true,
	},
	goLiveMessage: {
		fieldName: 'goLiveMessage',
		label: 'admin.fields.discord.goLiveMessage.label',
		maxLength: 300,
		tip: 'admin.fields.discord.goLiveMessage.tip',
		placeholder: 'admin.fields.discord.goLiveMessage.placeholder',
	},
};

export const BROWSER_PUSH_CONFIG_FIELDS = {
	goLiveMessage: {
		fieldName: 'goLiveMessage',
		label: 'admin.fields.browserPush.goLiveMessage.label',
		maxLength: 200,
		tip: 'admin.fields.browserPush.goLiveMessage.tip',
		placeholder: 'admin.fields.browserPush.goLiveMessage.placeholder',
	},
};

export const PASSWORD_COMPLEXITY_RULES = [
	{ min: 8, message: 'admin.fields.passwordComplexity.minLength' },
	{ max: 192, message: 'admin.fields.passwordComplexity.maxLength' },
	{
		pattern: /^(?=.*[a-z])/,
		message: 'admin.fields.passwordComplexity.lowercase',
	},
	{
		pattern: /^(?=.*[A-Z])/,
		message: 'admin.fields.passwordComplexity.uppercase',
	},
	{
		pattern: /\d/,
		message: 'admin.fields.passwordComplexity.number',
	},
	{
		pattern: /^(?=.*?[#?!@$%^&*-])/,
		message: 'admin.fields.passwordComplexity.specialCharacter',
	},
];

export const REGEX_PASSWORD = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[!@#$%^&*]).{8,192}$/;
