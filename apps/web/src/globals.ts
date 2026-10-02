// Node globals expected by some Midnight libraries in the browser.
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: { env: Record<string, string> } };
g.Buffer ??= Buffer;
g.process ??= { env: { NODE_ENV: import.meta.env.MODE } };
