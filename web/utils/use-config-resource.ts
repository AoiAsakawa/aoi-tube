import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { fetchData } from './apis';

export interface UseConfigResourceOptions<T> {
	/** Return an error string to block saving, or null to allow it. */
	validate?: (config: T) => string | null;
	successMessage?: string;
	errorMessage?: string;
	/** Transform the API response before storing it (e.g. fill defaults). */
	fromResponse?: (data: unknown) => T;
}

export interface UseConfigResource<T> {
	config: T;
	setConfig: React.Dispatch<React.SetStateAction<T>>;
	/** Shallow-merge a partial update into the config. */
	update: (patch: Partial<T>) => void;
	loading: boolean;
	saving: boolean;
	save: () => Promise<boolean>;
	reload: () => Promise<void>;
}

/**
 * Shared state/fetch/save plumbing for admin config pages backed by a
 * GET endpoint and a POST endpoint. Pages keep only their form markup.
 */
export function useConfigResource<T>(
	getEndpoint: string,
	setEndpoint: string,
	initial: T,
	options: UseConfigResourceOptions<T> = {},
): UseConfigResource<T> {
	const { t } = useTranslation();
	const [config, setConfig] = useState<T>(initial);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const reload = useCallback(async () => {
		try {
			const data = await fetchData(getEndpoint);
			setConfig(options.fromResponse ? options.fromResponse(data) : (data as T));
		} catch (error) {
			console.error(`Failed to fetch config from ${getEndpoint}:`, error);
		} finally {
			setLoading(false);
		}
	}, [getEndpoint]);

	useEffect(() => {
		reload();
	}, [reload]);

	const update = useCallback((patch: Partial<T>) => {
		setConfig(prev => ({ ...prev, ...patch }));
	}, []);

	const save = useCallback(async (): Promise<boolean> => {
		const validationError = options.validate?.(config);
		if (validationError) {
			message.error(validationError);
			return false;
		}

		setSaving(true);
		try {
			await fetchData(setEndpoint, { method: 'POST', data: config });
			message.success(options.successMessage ?? t('admin.config.shared.saveSuccess'));
			return true;
		} catch (error) {
			message.error(options.errorMessage ?? t('admin.config.shared.saveError'));
			console.error(`Failed to save config to ${setEndpoint}:`, error);
			return false;
		} finally {
			setSaving(false);
		}
	}, [config, setEndpoint]);

	return { config, setConfig, update, loading, saving, save, reload };
}
