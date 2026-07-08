import { useEffect, useState } from 'react';

// Single JS breakpoint consumer: subscribes to a media query and re-renders
// on changes, replacing scattered one-shot window.innerWidth reads. Keep
// queries aligned with styles/mixins.scss ($tablet: 768px).
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() =>
		typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
	);

	useEffect(() => {
		const mediaQueryList = window.matchMedia(query);
		const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
		setMatches(mediaQueryList.matches);
		mediaQueryList.addEventListener('change', onChange);
		return () => mediaQueryList.removeEventListener('change', onChange);
	}, [query]);

	return matches;
}
