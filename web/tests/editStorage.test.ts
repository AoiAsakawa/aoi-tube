import {
	checkSaveable,
	MASKED_S3_SECRET,
	S3FormValues,
	withS3Defaults,
} from '../components/admin/config/server/EditStorage';

// What the server sends for a stored connection with live distribution off:
// the secret masked, empty fields left out.
const stored = {
	enabled: false,
	endpoint: 'https://acct.r2.cloudflarestorage.com',
	accessKey: 'key',
	secret: MASKED_S3_SECRET,
	bucket: 'private-bucket',
	region: 'auto',
	forcePathStyle: true,
};

function form(overrides: Partial<S3FormValues> = {}): S3FormValues {
	return { ...withS3Defaults(stored), ...overrides };
}

describe('withS3Defaults', () => {
	test('fills fields the server leaves out', () => {
		expect(withS3Defaults({ bucket: 'b' })).toEqual({
			accessKey: '',
			acl: '',
			bucket: 'b',
			enabled: false,
			endpoint: '',
			forcePathStyle: false,
			region: '',
			secret: '',
			servingEndpoint: '',
		});
		expect(withS3Defaults(null).bucket).toBe('');
	});
});

describe('checkSaveable', () => {
	test('nothing changed: nothing to save', () => {
		expect(checkSaveable(form(), stored)).toBe(false);
	});

	test('the connection saves without live distribution', () => {
		// Before, the fields could only be saved with live distribution on,
		// which needs a public bucket.
		expect(checkSaveable(form({ secret: 'new-secret' }), stored)).toBe(true);
		expect(checkSaveable(form({ bucket: 'other' }), { ...stored, bucket: 'b' })).toBe(true);
	});

	test('an unchanged masked secret still counts as set', () => {
		expect(checkSaveable(form({ accessKey: 'rotated-key' }), stored)).toBe(true);
	});

	test('an incomplete connection does not save', () => {
		expect(checkSaveable(form({ secret: '' }), stored)).toBe(false);
		expect(checkSaveable(form({ endpoint: 'not a url' }), stored)).toBe(false);
	});

	test('clearing the connection saves only with live distribution off', () => {
		const cleared = { endpoint: '', accessKey: '', secret: '', bucket: '', region: '' };
		expect(checkSaveable(form(cleared), stored)).toBe(true);
		expect(checkSaveable(form({ ...cleared, enabled: true }), stored)).toBe(false);
	});

	test('turning live distribution on needs a complete connection', () => {
		expect(checkSaveable(form({ enabled: true }), stored)).toBe(true);
		expect(checkSaveable(form({ enabled: true, region: '' }), stored)).toBe(false);
	});

	test('a changed serving endpoint is a change', () => {
		expect(
			checkSaveable(form({ enabled: true, servingEndpoint: 'https://cdn.example.com' }), {
				...stored,
				enabled: true,
			}),
		).toBe(true);
	});
});
