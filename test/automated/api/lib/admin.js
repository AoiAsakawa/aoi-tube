var request = require('supertest');
request = request('http://127.0.0.1:8080');

const defaultAdminPassword = 'abc123';

async function getAdminResponse(endpoint, adminPassword = defaultAdminPassword) {
	const url = '/api/admin/' + endpoint;
	const res = await request
		.get(url)
		.auth('admin', adminPassword);

	// Accept 200 (OK) or 429 (Too Many Requests due to rate limiting)
	if (res.status !== 200 && res.status !== 429) {
		throw new Error(`Expected status 200 or 429, got ${res.status}`);
	}

	return res;
}

async function sendAdminRequest(
	endpoint,
	value,
	adminPassword = defaultAdminPassword
) {
	const url = '/api/admin/' + endpoint;
	const res = await request
		.post(url)
		.auth('admin', adminPassword)
		.send({ value: value });

	// Accept 200 (OK) or 429 (Too Many Requests due to rate limiting)
	if (res.status !== 200 && res.status !== 429) {
		throw new Error(`Expected status 200 or 429, got ${res.status}`);
	}

	if (res.status === 200) {
		expect(res.body.success).toBe(true);
	}
	return res;
}

async function sendAdminPayload(
	endpoint,
	payload,
	adminPassword = defaultAdminPassword
) {
	const url = '/api/admin/' + endpoint;
	const res = await request
		.post(url)
		.auth('admin', adminPassword)
		.send(payload);

	// Accept 200 (OK) or 429 (Too Many Requests due to rate limiting)
	if (res.status !== 200 && res.status !== 429) {
		throw new Error(`Expected status 200 or 429, got ${res.status}`);
	}

	if (res.status === 200) {
		expect(res.body.success).not.toBe(false);
	}

	return res;
}

async function failAdminRequest(
	endpoint,
	value,
	adminPassword = defaultAdminPassword,
	responseCode = 400
) {
	const url = '/api/admin/' + endpoint;
	const res = await request
		.post(url)
		.auth('admin', adminPassword)
		.send({ value: value });

	// Accept expected response code or 429 (Too Many Requests due to rate limiting)
	if (res.status !== responseCode && res.status !== 429) {
		throw new Error(`Expected status ${responseCode} or 429, got ${res.status}`);
	}

	if (res.status === responseCode) {
		expect(res.body.success).toBe(false);
	}
	return res;
}

module.exports.getAdminResponse = getAdminResponse;
module.exports.sendAdminRequest = sendAdminRequest;
module.exports.sendAdminPayload = sendAdminPayload;
module.exports.failAdminRequest = failAdminRequest;
