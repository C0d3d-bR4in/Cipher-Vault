// CipherVault Steganography Engine
// LSB embedding with AES-256-GCM + Argon2id KDF
// 100% client-side

import { argon2id } from 'hash-wasm';

const STEGO_MAGIC = [0x53, 0x54, 0x47, 0x31]; // "STG1"
const ARGON2_MEM_COST = 65536; // 64 MB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;

export interface StegoProgress {
  stage: string;
  percent: number;
  message: string;
}

// Seeded PRNG for deterministic pixel order from password
class SeededRNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }
}

function seedFromBytes(bytes: Uint8Array): number {
  let seed = 0;
  for (let i = 0; i < Math.min(bytes.length, 16); i++) {
    seed = (seed * 31 + bytes[i]) & 0xffffffff;
  }
  return seed >>> 0;
}

async function deriveKeyArgon2(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_TIME_COST,
    memorySize: ARGON2_MEM_COST,
    hashLength: 32,
    outputType: 'binary',
  });

  return crypto.subtle.importKey(
    'raw',
    hash.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptMessage(message: string, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKeyArgon2(password, salt);

  const encoded = new TextEncoder().encode(message);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  // Format: MAGIC(4) + SALT(32) + IV(12) + DATA(...)
  const result = new Uint8Array(4 + SALT_LENGTH + IV_LENGTH + encrypted.byteLength);
  result.set(STEGO_MAGIC, 0);
  result.set(salt, 4);
  result.set(iv, 4 + SALT_LENGTH);
  result.set(new Uint8Array(encrypted), 4 + SALT_LENGTH + IV_LENGTH);
  return result;
}

async function decryptMessage(data: Uint8Array, password: string): Promise<string> {
  // Validate magic
  for (let i = 0; i < 4; i++) {
    if (data[i] !== STEGO_MAGIC[i]) throw new Error('No hidden message found or invalid format');
  }

  const salt = data.slice(4, 4 + SALT_LENGTH);
  const iv = data.slice(4 + SALT_LENGTH, 4 + SALT_LENGTH + IV_LENGTH);
  const encrypted = data.slice(4 + SALT_LENGTH + IV_LENGTH);
  const key = await deriveKeyArgon2(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error('Decryption failed — wrong password or corrupted data');
  }
}

function getShuffledPixelIndices(totalPixels: number, salt: Uint8Array): number[] {
  const rng = new SeededRNG(seedFromBytes(salt));
  const indices = Array.from({ length: totalPixels }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function embedBitsInPixels(
  imageData: ImageData,
  data: Uint8Array,
  salt: Uint8Array
): void {
  const totalBits = data.length * 8 + 32; // 32 bits for length prefix
  const totalPixels = imageData.width * imageData.height;
  // Use 3 channels (R, G, B) per pixel, skip alpha
  const availableBits = totalPixels * 3;

  if (totalBits > availableBits) {
    throw new Error(`Message too large for this image. Need ${totalBits} bits, have ${availableBits} available.`);
  }

  const shuffled = getShuffledPixelIndices(totalPixels, salt);

  // Prepare bit stream: 32-bit length + data
  const bitStream: number[] = [];
  const len = data.length;
  for (let i = 31; i >= 0; i--) bitStream.push((len >> i) & 1);
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bitStream.push((byte >> i) & 1);
  }

  let bitIdx = 0;
  for (let p = 0; p < shuffled.length && bitIdx < bitStream.length; p++) {
    const pixelIdx = shuffled[p];
    const base = pixelIdx * 4;
    for (let c = 0; c < 3 && bitIdx < bitStream.length; c++) {
      imageData.data[base + c] = (imageData.data[base + c] & 0xfe) | bitStream[bitIdx];
      bitIdx++;
    }
  }
}

function extractBitsFromPixels(imageData: ImageData, salt: Uint8Array): Uint8Array {
  const totalPixels = imageData.width * imageData.height;
  const shuffled = getShuffledPixelIndices(totalPixels, salt);

  // Extract length (32 bits)
  const bits: number[] = [];
  let bitIdx = 0;
  let pixelP = 0;

  const readBits = (count: number) => {
    while (bits.length < bitIdx + count && pixelP < shuffled.length) {
      const base = shuffled[pixelP] * 4;
      for (let c = 0; c < 3; c++) {
        bits.push(imageData.data[base + c] & 1);
      }
      pixelP++;
    }
  };

  readBits(32);
  let len = 0;
  for (let i = 0; i < 32; i++) {
    len = (len << 1) | bits[i];
  }
  bitIdx = 32;

  if (len <= 0 || len > totalPixels) {
    throw new Error('No hidden message found');
  }

  readBits(len * 8);
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | (bits[bitIdx++] || 0);
    }
    result[i] = byte;
  }

  return result;
}

export async function loadImageToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; imageData: ImageData }> {
  if (!file.type.startsWith('image/png')) {
    throw new Error('Only PNG files are supported for steganography');
  }

  // Use createImageBitmap with options to prevent color space conversion
  // and alpha premultiplication, which corrupt LSB pixel data
  const bitmap = await createImageBitmap(file, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, imageData };
}


export async function stegoDecode(
  imageFile: File,
  password: string,
  onProgress?: (p: StegoProgress) => void
): Promise<string> {
  onProgress?.({ stage: 'loading', percent: 10, message: 'Loading image...' });

  const { imageData } = await loadImageToCanvas(imageFile);

  onProgress?.({ stage: 'extracting', percent: 30, message: 'Extracting hidden data from pixels...' });

  // We need to try extracting — the shuffle salt is derived from the embedded data itself
  // First pass: extract with identity mapping to get the salt
  // Actually, the salt is part of the encrypted payload which we embedded.
  // The shuffleSalt used during encoding = encrypted[4..20] (the argon2 salt).
  // During decoding, we don't know the salt yet — this is a chicken-and-egg problem.
  // Solution: embed the shuffle salt (16 bytes) unshuffled at fixed positions first,
  // then embed the rest shuffled. Let me refactor.

  // Actually, let me use a simpler approach: derive the shuffle seed from the password itself
  // This way both encoder and decoder can compute the same shuffle order.
  const encoder = new TextEncoder();
  const passwordHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(password)));
  const shuffleSalt = passwordHash.slice(0, 16);

  const rawData = extractBitsFromPixels(imageData, shuffleSalt);

  onProgress?.({ stage: 'decrypting', percent: 60, message: 'Decrypting message with Argon2id + AES-256-GCM...' });

  const decoded = await decryptMessage(rawData, password);

  onProgress?.({ stage: 'complete', percent: 100, message: 'Message extracted successfully!' });

  return decoded;
}

// Fix the encode function to also use password-derived shuffle salt for consistency
export async function stegoEncodeFixed(
  imageFile: File,
  message: string,
  password: string,
  onProgress?: (p: StegoProgress) => void
): Promise<Blob> {
  onProgress?.({ stage: 'loading', percent: 10, message: 'Loading image...' });

  const { canvas, imageData } = await loadImageToCanvas(imageFile);

  const totalPixels = imageData.width * imageData.height;
  if (totalPixels > 16_000_000) {
    console.warn('Large image detected — processing may be slow');
  }

  onProgress?.({ stage: 'encrypting', percent: 30, message: 'Encrypting message with Argon2id + AES-256-GCM...' });
  const encrypted = await encryptMessage(message, password);

  // Derive shuffle salt from password (so decoder can reproduce)
  const encoder = new TextEncoder();
  const passwordHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(password)));
  const shuffleSalt = passwordHash.slice(0, 16);

  onProgress?.({ stage: 'embedding', percent: 60, message: 'Embedding encrypted data in pixels...' });
  embedBitsInPixels(imageData, encrypted, shuffleSalt);

  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  onProgress?.({ stage: 'complete', percent: 100, message: 'Steganography complete!' });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create PNG'))),
      'image/png'
    );
  });
}

// Challenge Mode utilities
export interface ChallengeConfig {
  layers: number;
  passwords: string[];
  secretPhrase?: string;
  timeLockIterations?: number;
}

async function deriveKeyArgon2WithCost(
  password: string,
  salt: Uint8Array,
  timeCost: number
): Promise<CryptoKey> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: timeCost,
    memorySize: ARGON2_MEM_COST,
    hashLength: 32,
    outputType: 'binary',
  });

  return crypto.subtle.importKey(
    'raw',
    hash.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function challengeEncrypt(
  message: string,
  config: ChallengeConfig,
  onProgress?: (p: StegoProgress) => void
): Promise<string> {
  let data = message;

  // Prepend secret phrase if provided
  if (config.secretPhrase) {
    data = `PHRASE:${config.secretPhrase}:${data}`;
  }

  const timeCost = config.timeLockIterations || ARGON2_TIME_COST;

  // Multi-layer encryption
  for (let i = 0; i < config.layers; i++) {
    const pw = config.passwords[i % config.passwords.length];
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    onProgress?.({
      stage: 'encrypting',
      percent: Math.round(((i + 1) / config.layers) * 80) + 10,
      message: `Encrypting layer ${i + 1}/${config.layers}...`,
    });

    const key = await deriveKeyArgon2WithCost(pw, salt, timeCost);
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    // Encode as base64 with salt+iv prefix
    const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, SALT_LENGTH);
    combined.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH);

    data = `LAYER:${btoa(String.fromCharCode(...combined))}`;
  }

  onProgress?.({ stage: 'complete', percent: 100, message: 'Challenge puzzle created!' });
  return data;
}

export async function challengeDecrypt(
  encrypted: string,
  config: ChallengeConfig,
  onProgress?: (p: StegoProgress) => void
): Promise<string> {
  let data = encrypted;
  const timeCost = config.timeLockIterations || ARGON2_TIME_COST;

  // Decrypt layers in reverse
  for (let i = config.layers - 1; i >= 0; i--) {
    if (!data.startsWith('LAYER:')) {
      throw new Error(`Expected encrypted layer ${i + 1}, got invalid data`);
    }

    const b64 = data.slice(6);
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encData = combined.slice(SALT_LENGTH + IV_LENGTH);

    const pw = config.passwords[i % config.passwords.length];

    onProgress?.({
      stage: 'decrypting',
      percent: Math.round(((config.layers - i) / config.layers) * 80) + 10,
      message: `Decrypting layer ${config.layers - i}/${config.layers}...`,
    });

    const key = await deriveKeyArgon2WithCost(pw, salt, timeCost);

    try {
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encData);
      data = new TextDecoder().decode(decrypted);
    } catch {
      throw new Error(`Layer ${i + 1} decryption failed — wrong password`);
    }
  }

  // Check secret phrase
  if (config.secretPhrase) {
    const prefix = `PHRASE:${config.secretPhrase}:`;
    if (!data.startsWith(prefix)) {
      throw new Error('Secret phrase verification failed');
    }
    data = data.slice(prefix.length);
  }

  onProgress?.({ stage: 'complete', percent: 100, message: 'Challenge solved!' });
  return data;
}

export function getMaxMessageLength(width: number, height: number): number {
  const totalPixels = width * height;
  const availableBits = totalPixels * 3;
  // Subtract 32 bits for length prefix, divide by 8, subtract overhead for encryption (magic+salt+iv+tag ≈ 64 bytes)
  return Math.floor((availableBits - 32) / 8) - 64;
}
