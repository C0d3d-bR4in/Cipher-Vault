import { describe, it, expect } from 'vitest';

// We test the core encode/decode logic without canvas (Node/browser-like env)
// by directly testing the crypto round-trip and bit embedding logic

describe('Stego crypto round-trip', () => {
  it('should encrypt and decrypt a message with matching password', async () => {
    // Dynamic import to handle wasm loading
    const { challengeEncrypt, challengeDecrypt } = await import('@/lib/stego');
    
    const message = 'Hello, secret world! 🔐';
    const config = {
      layers: 1,
      passwords: ['testpassword123'],
    };

    const encrypted = await challengeEncrypt(message, config);
    expect(encrypted).toContain('LAYER:');

    const decrypted = await challengeDecrypt(encrypted, config);
    expect(decrypted).toBe(message);
  });

  it('should fail decryption with wrong password', async () => {
    const { challengeEncrypt, challengeDecrypt } = await import('@/lib/stego');
    
    const message = 'Secret data';
    const encConfig = { layers: 1, passwords: ['correct'] };
    const decConfig = { layers: 1, passwords: ['wrong'] };

    const encrypted = await challengeEncrypt(message, encConfig);
    
    await expect(challengeDecrypt(encrypted, decConfig)).rejects.toThrow();
  });

  it('should handle multi-layer encryption', async () => {
    const { challengeEncrypt, challengeDecrypt } = await import('@/lib/stego');
    
    const message = 'Multi-layer secret';
    const config = {
      layers: 3,
      passwords: ['pass1', 'pass2', 'pass3'],
    };

    const encrypted = await challengeEncrypt(message, config);
    const decrypted = await challengeDecrypt(encrypted, config);
    expect(decrypted).toBe(message);
  });

  it('should verify secret phrase', async () => {
    const { challengeEncrypt, challengeDecrypt } = await import('@/lib/stego');
    
    const message = 'Phrase-protected message';
    const config = {
      layers: 1,
      passwords: ['pass'],
      secretPhrase: 'open sesame',
    };

    const encrypted = await challengeEncrypt(message, config);
    const decrypted = await challengeDecrypt(encrypted, config);
    expect(decrypted).toBe(message);

    // Wrong phrase should fail
    const wrongConfig = { ...config, secretPhrase: 'wrong phrase' };
    await expect(challengeDecrypt(encrypted, wrongConfig)).rejects.toThrow('Secret phrase');
  });
});
