import { createContext } from 'react';
import { ServerStatus } from '../interfaces/server-status.model';

const ENDPOINT = `/api/status`;

export interface ServerStatusStaticService {
	getStatus(): Promise<ServerStatus>;
}

class ServerStatusService {
	public static async getStatus(): Promise<ServerStatus> {
		// Send the chat access token along so moderators still see the real
		// status while silent (test) stream mode reports offline to others.
		const accessToken =
			typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null;
		const url = accessToken ? `${ENDPOINT}?accessToken=${encodeURIComponent(accessToken)}` : ENDPOINT;
		const response = await fetch(url);
		const status = await response.json();
		return status;
	}
}

export const ServerStatusServiceContext =
	createContext<ServerStatusStaticService>(ServerStatusService);
