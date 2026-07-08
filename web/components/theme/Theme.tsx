import Head from '@components/compat/Head';
import { FC, useEffect, useState } from 'react';
import { useClientConfig } from '../stores/zustand-store';

export const Theme: FC = () => {
	const clientConfig = useClientConfig();
	const { appearanceVariables, customStyles } = clientConfig;

	const appearanceVars = Object.keys(appearanceVariables || {})
		.filter(variable => !!appearanceVariables[variable])
		.map(variable => `--${variable}: ${appearanceVariables[variable]}`);

	const [themeColor, setThemeColor] = useState('#fff');

	useEffect(() => {
		const color = getComputedStyle(document.documentElement).getPropertyValue(
			'--theme-color-background-header',
		);
		setThemeColor(color);
	}, [appearanceVars]);

	return (
		<>
			<Head>
				<meta name="theme-color" content={themeColor} />
			</Head>
			<style
				dangerouslySetInnerHTML={{
					__html: `
				:root {
					${appearanceVars.join(';\n')}
				}
				${customStyles}
			`,
				}}
			/>
		</>
	);
};
