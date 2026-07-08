export interface AuthDetail {
	type: string;
	handle?: string;
}

export class User {
	constructor(u) {
		this.id = u.id;
		this.displayName = u.displayName;
		this.displayColor = u.displayColor;
		this.createdAt = u.createdAt;
		this.previousNames = u.previousNames;
		this.nameChangedAt = u.nameChangedAt;
		this.scopes = u.scopes;
		this.authenticated = u.authenticated;
		this.authType = u.authType;
		this.authDetails = u.authDetails;
	}

	id: string;

	displayName: string;

	displayColor: number;

	createdAt: Date;

	previousNames: string[];

	nameChangedAt: Date;

	scopes: string[];

	authenticated: boolean;

	authType?: string;

	// The user's own linked social accounts (only populated for the connected
	// user's self-info event, never for other users in chat).
	authDetails?: AuthDetail[];

	public isModerator = (): boolean => {
		if (!this.scopes || this.scopes.length === 0) {
			return false;
		}

		return this.scopes.includes('MODERATOR');
	};
}
