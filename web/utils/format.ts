import { UAParser } from 'ua-parser-js';

export function formatIPAddress(ipAddress: string): string {
	const ipAddressComponents = ipAddress.split(':');

	// Wipe out the port component
	ipAddressComponents[ipAddressComponents.length - 1] = '';

	let ip = ipAddressComponents.join(':');
	ip = ip.slice(0, ip.length - 1);
	if (ip === '[::1]' || ip === '127.0.0.1') {
		return 'Localhost';
	}

	return ip;
}

// check if obj is {}
export function isEmptyObject(obj) {
	return !obj || (Object.keys(obj).length === 0 && obj.constructor === Object);
}

function padLeft(text, pad, size) {
	return String(pad.repeat(size) + text).slice(-size);
}

export function parseSecondsToDurationString(seconds = 0) {
	const finiteSeconds = Number.isFinite(+seconds) ? Math.abs(seconds) : 0;

	const days = Math.floor(finiteSeconds / 86400);
	const daysString = days > 0 ? `${days} day${days > 1 ? 's' : ''} ` : '';

	const hours = Math.floor((finiteSeconds / 3600) % 24);
	const hoursString = hours || days ? padLeft(`${hours}:`, '0', 3) : '';

	const mins = Math.floor((finiteSeconds / 60) % 60);
	const minString = padLeft(`${mins}:`, '0', 3);

	const secs = Math.floor(finiteSeconds % 60);
	const secsString = padLeft(`${secs}`, '0', 2);

	return daysString + hoursString + minString + secsString;
}

export function formatUAstring(uaString: string) {
	const parser = new UAParser(uaString);
	const device = parser.getDevice();
	const os = parser.getOS();
	const browser = parser.getBrowser();
	const { major: browserVersion, name } = browser;
	const { version: osVersion, name: osName } = os;
	const { model, type } = device;

	if (uaString === 'libmpv') {
		return 'mpv media player';
	}
	// Fallback to just displaying the raw agent string.
	if (!name || !browserVersion || !osName) {
		return uaString;
	}

	const deviceString = model || type ? ` (${model || type})` : '';
	return `${name} ${browserVersion} on ${osName} ${osVersion}
  ${deviceString}`;
}

// Human-readable file size (e.g. "1.24 GB", "830 MB"). Returns "-" for
// missing/zero values (manifests that predate size recording).
export function formatFileSize(bytes?: number): string {
	if (!bytes || bytes <= 0) {
		return '-';
	}
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit += 1;
	}
	const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
	return `${value.toFixed(digits)} ${units[unit]}`;
}
