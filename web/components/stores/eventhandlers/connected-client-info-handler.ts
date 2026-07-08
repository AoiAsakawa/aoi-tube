import { ConnectedClientInfoEvent } from '../../../interfaces/socket-events';

export function handleConnectedClientInfoMessage(
	message: ConnectedClientInfoEvent,
	setChatAuthenticated: (boolean) => void,
	setCurrentUser: (CurrentUser) => void,
) {
	const { user } = message;
	const { id, displayName, displayColor, scopes, authenticated, authDetails } = user;
	setChatAuthenticated(authenticated);

	setCurrentUser({
		id: id.toString(),
		displayName,
		displayColor,
		isModerator: scopes?.includes('MODERATOR'),
		authDetails,
	});
}
