/**
 * End-to-end encryption for online rooms.
 *
 * Every device owns an ECDH P-256 key pair (kept in localStorage). The player
 * id is a hash of the public key, so a seat is bound to a key: whoever
 * reconnects claiming that id can only read the hand if they hold the private
 * key. Host and guest derive a shared AES-GCM key; hands and moves travel
 * encrypted, so other people in the room (and the relay server) only ever see
 * ciphertext.
 */
import { KEYS, loadJson, saveJson } from '../state/storage';

export interface Identity {
  id: string;
  pub: JsonWebKey;
  priv: JsonWebKey;
}

export interface Sealed {
  iv: string;
  ct: string;
}

const ECDH: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Stable short id for a public key. */
export async function publicId(pub: JsonWebKey): Promise<string> {
  const data = new TextEncoder().encode(`${pub.crv}|${pub.x}|${pub.y}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadIdentity(): Promise<Identity> {
  const saved = loadJson<Identity>(KEYS.identity);
  if (saved?.id && saved.pub?.x && saved.priv?.d) return saved;
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const identity: Identity = { id: await publicId(pub), pub, priv };
  saveJson(KEYS.identity, identity);
  return identity;
}

export async function deriveSharedKey(priv: JsonWebKey, peerPub: JsonWebKey): Promise<CryptoKey> {
  const mine = await crypto.subtle.importKey('jwk', priv, ECDH, false, ['deriveKey']);
  const theirs = await crypto.subtle.importKey(
    'jwk',
    { kty: peerPub.kty, crv: peerPub.crv, x: peerPub.x, y: peerPub.y, ext: true },
    ECDH,
    false,
    [],
  );
  return crypto.subtle.deriveKey({ name: 'ECDH', public: theirs }, mine, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Decrypts and authenticates; throws if the message was not made with this key. */
export async function unseal<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

/** 5-character room codes without look-alike characters (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
}

export function isRoomCode(code: string): boolean {
  return code.length === 5 && [...code].every((ch) => CODE_ALPHABET.includes(ch));
}
