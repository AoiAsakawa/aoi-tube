// Node globals that Next.js/webpack polyfilled automatically but Vite does not.
// `global` is handled by a build-time define in vite.config.ts; `Buffer` cannot
// be, because it is a runtime object rather than a constant.
//
// The crypto wallet paths need it: bitcoinjs-lib and our own PSBT code call
// Buffer.from/alloc, and @solana/web3.js serializes transactions through it.
// Without this the donation form threw "Buffer is not defined" as soon as a
// viewer picked Bitcoin (and on the Solana send path).
//
// This module must be imported before any of that code evaluates, so it is the
// first import of the viewer entry. Importing the polyfill (rather than
// injecting an inline script) keeps it compatible with the strict script-src CSP.
import { Buffer as BufferPolyfill } from 'buffer';

// Only the runtime value is missing — the `Buffer` *type* is already global (the
// wallet code annotates with it), so declaring it here would be self-referential.
const globalWithBuffer = globalThis as { Buffer?: typeof BufferPolyfill };
if (typeof globalWithBuffer.Buffer === 'undefined') {
	globalWithBuffer.Buffer = BufferPolyfill;
}

export {};
