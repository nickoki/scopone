import { describe, expect, it } from 'vitest';
import { deriveSharedKey, isRoomCode, loadIdentity, makeRoomCode, normalizeRoomCode, publicId, seal, unseal } from './crypto';

async function freshIdentity() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { id: await publicId(pub), pub, priv };
}

describe('room codes', () => {
  it('are 5 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}$/);
      expect(isRoomCode(code)).toBe(true);
      expect(normalizeRoomCode(code.toLowerCase())).toBe(code);
    }
  });

  it('normalises what people type', () => {
    expect(normalizeRoomCode(' ab-c2 3 ')).toBe('ABC23');
    expect(normalizeRoomCode('abcdefgh')).toBe('ABCDE');
    expect(isRoomCode('ABC')).toBe(false);
  });
});

describe('end-to-end encryption', () => {
  it('host and guest derive the same key; a third player cannot read the message', async () => {
    const host = await freshIdentity();
    const guest = await freshIdentity();
    const other = await freshIdentity();
    const hostKey = await deriveSharedKey(host.priv, guest.pub);
    const guestKey = await deriveSharedKey(guest.priv, host.pub);
    const otherKey = await deriveSharedKey(other.priv, host.pub);

    const secret = { hand: [1, 2, 3], seat: 2 };
    const sealed = await seal(hostKey, secret);
    expect(JSON.stringify(sealed)).not.toContain('hand');
    expect(await unseal(guestKey, sealed)).toEqual(secret);
    await expect(unseal(otherKey, sealed)).rejects.toBeTruthy();
  });

  it('rejects tampered messages', async () => {
    const host = await freshIdentity();
    const guest = await freshIdentity();
    const key = await deriveSharedKey(host.priv, guest.pub);
    const sealed = await seal(key, { move: 7 });
    const bad = { ...sealed, ct: (sealed.ct[0] === 'A' ? 'B' : 'A') + sealed.ct.slice(1) };
    await expect(unseal(key, bad)).rejects.toBeTruthy();
  });

  it('ids are bound to the public key', async () => {
    const a = await freshIdentity();
    const b = await freshIdentity();
    expect(a.id).toMatch(/^[0-9a-f]{16}$/);
    expect(a.id).not.toBe(b.id);
    expect(await publicId(a.pub)).toBe(a.id);
  });

  it('loadIdentity works even when storage is unavailable', async () => {
    const id = await loadIdentity();
    expect(await publicId(id.pub)).toBe(id.id);
  });
});
