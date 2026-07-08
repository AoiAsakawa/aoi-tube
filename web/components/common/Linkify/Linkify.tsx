import { FC, Fragment, ReactNode } from 'react';

// Minimal text linkifier replacing the unmaintained react-linkify (2019 CJS
// package: its default-export interop broke under Vite 8/rolldown, and it
// pinned a ReDoS-vulnerable linkify-it). Only plain-string children are
// linkified; anything else renders unchanged.
const URL_PATTERN = /(https?:\/\/[^\s<>"'）)\]]+)/g;

const linkifyString = (text: string): ReactNode => {
	const parts = text.split(URL_PATTERN);
	if (parts.length === 1) {
		return text;
	}
	return parts.map((part, i) =>
		part.match(/^https?:\/\//) ? (
			 
			<a key={i} href={part} target="_blank" rel="noopener noreferrer">
				{part}
			</a>
		) : (
			 
			<Fragment key={i}>{part}</Fragment>
		),
	);
};

export type LinkifyProps = {
	children?: ReactNode;
};

export const Linkify: FC<LinkifyProps> = ({ children }) => (
	<>{typeof children === 'string' ? linkifyString(children) : children}</>
);

export default Linkify;
