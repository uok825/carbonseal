// SPDX-License-Identifier: Apache-2.0

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) throw new Error(`Invalid hex string: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Encodes a short human-readable reference (shipment number, EORI) as a zero-padded Bytes<32>. */
export const labelToBytes = (label: string): Uint8Array => {
  const encoded = new TextEncoder().encode(label);
  if (encoded.length > 32) throw new Error(`Reference "${label}" is longer than 32 bytes`);
  const out = new Uint8Array(32);
  out.set(encoded);
  return out;
};

/** Inverse of {@link labelToBytes}; returns undefined for bytes that are not a padded UTF-8 label. */
export const bytesToLabel = (bytes: Uint8Array): string | undefined => {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  if (end === 0) return undefined;
  if (bytes.subarray(0, end).includes(0)) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end));
    return /^[\x20-\x7e -￿]+$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
};

export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

export const shortHex = (hex: string, chars = 6): string =>
  hex.length <= chars * 2 ? hex : `${hex.slice(0, chars)}…${hex.slice(-chars)}`;
