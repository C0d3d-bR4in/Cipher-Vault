// CipherVault Dual-Container (Plausible Deniability) Engine
// CVLT v2 binary format with Argon2id + AES-256-GCM
// Two fixed-size slots — no metadata reveals hidden vault existence.
// 100% client-side using Web Crypto API + Argon2id WASM.

import { argon2id } from 'hash-wasm';

// === Constants ===
const CVLT_MAGIC = new Uint8Array([0x43, 0x56, 0x4c, 0x54]); // "CVLT"
const CVLT_VERSION = 0x02;
const GLOBAL_HEADER_SIZE = 16;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD_STRING = 'CVLT-V2-CONTAINER';
const ARGON2_MEM_COST = 65536; // 64 MB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const MIN_SLOT_SIZE = 256;

export interface DualContainerProgress {
  stage: string;
  percent: number;
  message: string;
}

export interface DualEncryptResult {
  blob: Blob;
  slotSize: number;
}

export interface DualDecryptResult {
  data: Uint8Array;
}

// === Key Derivation (Argon2id) ===
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_TIME_COST,
    memorySize: ARGON2_MEM_COST,
    hashLength: 32,
    outputType: 'binary',
  });

  const keyBytes = new Uint8Array(hash);
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// === Buffer Wipe ===
// Fill a buffer with cryptographic random bytes (handles >65536 byte limit)
function cryptoRandomFill(buf: Uint8Array): void {
  const MAX_CHUNK = 65536;
  for (let offset = 0; offset < buf.length; offset += MAX_CHUNK) {
    const len = Math.min(MAX_CHUNK, buf.length - offset);
    const chunk = new Uint8Array(len);
    crypto.getRandomValues(chunk);
    buf.set(chunk, offset);
  }
}

function wipeBuffer(buf: Uint8Array): void {
  cryptoRandomFill(buf);
  buf.fill(0);
}

// === Encrypt a single container slot (fixed-size padding) ===
async function encryptSlot(
  plaintext: Uint8Array,
  password: string,
  slotSize: number,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const aadBytes = new TextEncoder().encode(AAD_STRING);

  const key = await deriveKey(password, salt);

  // Available space for ciphertext+tag = slotSize - SALT - IV
  const encryptedAreaSize = slotSize - SALT_LENGTH - IV_LENGTH;
  // Plaintext padded size = encryptedAreaSize - AUTH_TAG (appended by WebCrypto)
  const plaintextPaddedSize = encryptedAreaSize - AUTH_TAG_LENGTH;

  // Build padded plaintext: LENGTH(4 bytes BE) + DATA + RANDOM_PADDING
  const paddedPlaintext = new Uint8Array(plaintextPaddedSize);
  cryptoRandomFill(paddedPlaintext); // random fill first
  new DataView(paddedPlaintext.buffer).setUint32(0, plaintext.length, false);
  paddedPlaintext.set(plaintext, 4);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      additionalData: aadBytes as BufferSource,
      tagLength: 128,
    },
    key,
    paddedPlaintext as BufferSource,
  );

  // Slot: SALT(16) + IV(12) + ENCRYPTED(ciphertext+tag)
  const slot = new Uint8Array(slotSize);
  slot.set(salt, 0);
  slot.set(iv, SALT_LENGTH);
  slot.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH);

  wipeBuffer(paddedPlaintext);
  return slot;
}

// === Try decrypt a single slot ===
async function tryDecryptSlot(
  slotData: Uint8Array,
  password: string,
): Promise<Uint8Array | null> {
  const salt = slotData.slice(0, SALT_LENGTH);
  const iv = slotData.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encryptedArea = slotData.slice(SALT_LENGTH + IV_LENGTH);
  const aadBytes = new TextEncoder().encode(AAD_STRING);

  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: aadBytes as BufferSource,
        tagLength: 128,
      },
      key,
      encryptedArea as BufferSource,
    );

    const view = new DataView(decrypted);
    const payloadLen = view.getUint32(0, false);
    if (payloadLen < 0 || payloadLen > decrypted.byteLength - 4) {
      return null;
    }
    return new Uint8Array(decrypted, 4, payloadLen);
  } catch {
    return null; // Auth tag failed — wrong password
  }
}

// === Public API: Encrypt ===
export async function dualEncrypt(
  publicData: Uint8Array,
  publicPassword: string,
  hiddenData: Uint8Array | null,
  hiddenPassword: string | null,
  onProgress?: (p: DualContainerProgress) => void,
): Promise<DualEncryptResult> {
  onProgress?.({ stage: 'preparing', percent: 5, message: 'Calculating container geometry...' });

  // Determine slot size to fit both payloads
  const pub4 = publicData.length + 4;
  const hid4 = hiddenData ? hiddenData.length + 4 : 0;
  const maxPlaintext = Math.max(pub4, hid4);
  const minEncArea = maxPlaintext + AUTH_TAG_LENGTH;
  const minSlot = minEncArea + SALT_LENGTH + IV_LENGTH;
  const slotSize = Math.max(Math.ceil(minSlot / 64) * 64, MIN_SLOT_SIZE);

  onProgress?.({ stage: 'encrypting-public', percent: 15, message: 'Argon2id key derivation — public container...' });
  const slot1 = await encryptSlot(publicData, publicPassword, slotSize);

  onProgress?.({
    stage: 'encrypting-hidden',
    percent: 55,
    message: hiddenPassword
      ? 'Argon2id key derivation — hidden container...'
      : 'Filling slot 2 with cryptographic noise...',
  });

  let slot2: Uint8Array;
  if (hiddenData && hiddenPassword) {
    slot2 = await encryptSlot(hiddenData, hiddenPassword, slotSize);
  } else {
    slot2 = new Uint8Array(slotSize);
    cryptoRandomFill(slot2);
  }

  onProgress?.({ stage: 'packaging', percent: 90, message: 'Assembling CVLT v2 binary...' });

  // Global header (16 bytes)
  const header = new Uint8Array(GLOBAL_HEADER_SIZE);
  header.set(CVLT_MAGIC, 0);
  header[4] = CVLT_VERSION;
  new DataView(header.buffer).setUint32(5, slotSize, false);
  header.set(crypto.getRandomValues(new Uint8Array(7)), 9); // random filler

  const totalSize = GLOBAL_HEADER_SIZE + slotSize * 2;
  const output = new Uint8Array(totalSize);
  output.set(header, 0);
  output.set(slot1, GLOBAL_HEADER_SIZE);
  output.set(slot2, GLOBAL_HEADER_SIZE + slotSize);

  wipeBuffer(slot1);
  wipeBuffer(slot2);

  onProgress?.({ stage: 'complete', percent: 100, message: 'Dual-container vault assembled.' });

  return { blob: new Blob([output], { type: 'application/octet-stream' }), slotSize };
}

// === Public API: Decrypt ===
export async function dualDecrypt(
  vaultData: Uint8Array,
  password: string,
  onProgress?: (p: DualContainerProgress) => void,
): Promise<DualDecryptResult> {
  onProgress?.({ stage: 'parsing', percent: 5, message: 'Parsing CVLT v2 header...' });

  if (vaultData.length < GLOBAL_HEADER_SIZE) throw new Error('Decryption failed.');
  for (let i = 0; i < 4; i++) {
    if (vaultData[i] !== CVLT_MAGIC[i]) throw new Error('Decryption failed.');
  }
  if (vaultData[4] !== CVLT_VERSION) throw new Error('Decryption failed.');

  const slotSize = new DataView(vaultData.buffer, vaultData.byteOffset).getUint32(5, false);
  if (vaultData.length < GLOBAL_HEADER_SIZE + slotSize * 2) throw new Error('Decryption failed.');

  const slot1 = vaultData.slice(GLOBAL_HEADER_SIZE, GLOBAL_HEADER_SIZE + slotSize);
  const slot2 = vaultData.slice(GLOBAL_HEADER_SIZE + slotSize, GLOBAL_HEADER_SIZE + slotSize * 2);

  // Uniform timing: always attempt both slots
  onProgress?.({ stage: 'deriving-key', percent: 20, message: 'Argon2id key derivation...' });

  const [result1, result2] = await Promise.all([
    tryDecryptSlot(slot1, password),
    tryDecryptSlot(slot2, password),
  ]);

  onProgress?.({ stage: 'verifying', percent: 90, message: 'Verifying authentication...' });

  const result = result1 ?? result2;
  if (!result) {
    await new Promise(r => setTimeout(r, 50)); // constant delay
    throw new Error('Decryption failed.');
  }

  onProgress?.({ stage: 'complete', percent: 100, message: 'Container decrypted.' });
  return { data: result };
}

export function getMaxPayloadSize(slotSize: number): number {
  return slotSize - SALT_LENGTH - IV_LENGTH - AUTH_TAG_LENGTH - 4;
}
