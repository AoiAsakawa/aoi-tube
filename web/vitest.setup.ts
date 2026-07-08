import '@testing-library/jest-dom/vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

// Mock IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
	readonly root: Element | null = null;
	readonly rootMargin: string = '';
	readonly thresholds: ReadonlyArray<number> = [];

	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
	takeRecords = vi.fn(() => []);
}

Object.defineProperty(window, 'IntersectionObserver', {
	writable: true,
	value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
	writable: true,
	value: MockResizeObserver,
});
