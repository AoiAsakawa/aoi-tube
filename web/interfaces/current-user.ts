// One linked social account for the current user: provider type and the
// account's handle (e.g. an X @handle or a GitHub login). Shown to the user in
// their own account panel; not the public chat name.
export interface AuthDetail {
	type: string;
	handle?: string;
}

export interface CurrentUser {
	id: string;
	displayName: string;
	displayColor: number;
	isModerator: boolean;
	// The current user's own linked social accounts (self-view only).
	authDetails?: AuthDetail[];
}
