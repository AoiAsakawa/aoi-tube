/**
 * Framework-agnostic lazy-loading indirection.
 *
 * Reimplemented on React.lazy + Suspense. Normalises the loader result so all
 * of the app's usage shapes work: `import('mod')` (has `default`),
 * `import('mod').then(m => m.Named)` and `import('mod').then(m => m.default)`
 * (resolve to the component itself). The Next.js `ssr: false` option is a no-op
 * in this SPA build; `loading` becomes the Suspense fallback.
 */
import { ComponentType, ReactNode, Suspense, lazy } from 'react';

type Loader = () => Promise<unknown>;

interface DynamicOptions {
	ssr?: boolean;
	loading?: () => ReactNode;
}

export function dynamic<P = Record<string, unknown>>(
	loader: Loader,
	options: DynamicOptions = {},
): ComponentType<P> {
	const LazyComponent = lazy(async () => {
		const mod = (await loader()) as { default?: ComponentType<P> } | ComponentType<P>;
		const component =
			mod && (mod as { default?: ComponentType<P> }).default !== undefined
				? (mod as { default: ComponentType<P> }).default
				: (mod as ComponentType<P>);
		return { default: component };
	});

	const { loading } = options;
	const AnyLazy = LazyComponent as ComponentType<any>;

	const Dynamic = (props: P) => (
		<Suspense fallback={loading ? <>{loading()}</> : null}>
			<AnyLazy {...props} />
		</Suspense>
	);

	return Dynamic as ComponentType<P>;
}

export default dynamic;
