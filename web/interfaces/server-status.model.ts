export interface ProtocolInfo {
	activeProtocol: string; // 'hls', 'll-hls', 'hls+webrtc', 'll-hls+webrtc'
	expectedLatency: string;
	hlsEnabled: boolean;
	llhlsEnabled: boolean;
	webrtcEnabled: boolean;
}

export interface ServerStatus {
	online: boolean;
	viewerCount: number;
	lastConnectTime?: Date;
	lastDisconnectTime?: Date;
	versionNumber?: string;
	streamTitle?: string;
	serverTime: Date;
	protocol?: ProtocolInfo;
	// True while the operator runs a silent (test) broadcast; the header shows
	// a TEST badge instead of LIVE.
	silentMode?: boolean;
}

export function makeEmptyServerStatus(): ServerStatus {
	return {
		online: false,
		viewerCount: 0,
		serverTime: new Date(),
		silentMode: false,
		protocol: {
			activeProtocol: 'hls',
			expectedLatency: '10-30秒',
			hlsEnabled: true,
			llhlsEnabled: false,
			webrtcEnabled: false,
		},
	};
}
