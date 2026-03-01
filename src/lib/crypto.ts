// CipherVault Crypto Engine
// AES-256-GCM with PBKDF2 + HKDF key derivation
// 100% client-side using Web Crypto API

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const VAULT_MAGIC = new Uint8Array([0x56, 0x4c, 0x54, 0x31]); // "VLT1"

interface VaultMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  sha256: string;
}

export interface EncryptionProgress {
  stage: 'deriving-key' | 'encrypting' | 'packaging' | 'complete';
  percent: number;
  message: string;
}

export interface DecryptionProgress {
  stage: 'parsing' | 'deriving-key' | 'decrypting' | 'complete';
  percent: number;
  message: string;
}

function concatBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // PBKDF2 → base key material
  const baseKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  // Import base key for HKDF
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    baseKeyBits,
    'HKDF',
    false,
    ['deriveKey']
  );

  // HKDF → final AES-256-GCM key
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode('CipherVault-AES256GCM') as BufferSource,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return aesKey;
}

export async function computeSHA256(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptFile(
  file: File,
  password: string,
  onProgress?: (progress: EncryptionProgress) => void
): Promise<{ blob: Blob; fileName: string; sha256: string }> {
  onProgress?.({ stage: 'deriving-key', percent: 10, message: 'Deriving encryption key...' });

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  onProgress?.({ stage: 'encrypting', percent: 30, message: 'Encrypting file data...' });

  const fileData = await file.arrayBuffer();

  // Compute SHA-256 of original file
  const sha256 = await computeSHA256(fileData);

  // Metadata (includes hash for integrity verification)
  const metadata: VaultMetadata = {
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    fileSize: file.size,
    sha256,
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));

  // Combine metadata length (4 bytes) + metadata + file data
  const metaLenBuf = new ArrayBuffer(4);
  new DataView(metaLenBuf).setUint32(0, metadataBytes.byteLength);
  const plaintext = concatBuffers(metaLenBuf, metadataBytes.buffer, fileData);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  onProgress?.({ stage: 'packaging', percent: 80, message: 'Packaging vault file...' });

  // Vault format: MAGIC(4) + SALT(32) + IV(12) + ENCRYPTED_DATA
  const vaultData = concatBuffers(
    VAULT_MAGIC.buffer,
    salt.buffer,
    iv.buffer,
    encrypted
  );

  onProgress?.({ stage: 'complete', percent: 100, message: 'Encryption complete!' });

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return {
    blob: new Blob([vaultData], { type: 'application/octet-stream' }),
    fileName: `${baseName}.vault`,
    sha256,
  };
}

export async function decryptFile(
  vaultFile: File,
  password: string,
  onProgress?: (progress: DecryptionProgress) => void
): Promise<{ blob: Blob; fileName: string; fileType: string; sha256: string; storedSha256: string }> {
  onProgress?.({ stage: 'parsing', percent: 10, message: 'Parsing vault file...' });

  const vaultData = new Uint8Array(await vaultFile.arrayBuffer());

  // Validate magic bytes
  const magic = vaultData.slice(0, 4);
  if (magic[0] !== 0x56 || magic[1] !== 0x4c || magic[2] !== 0x54 || magic[3] !== 0x31) {
    throw new Error('Invalid vault file format');
  }

  const salt = vaultData.slice(4, 4 + SALT_LENGTH);
  const iv = vaultData.slice(4 + SALT_LENGTH, 4 + SALT_LENGTH + IV_LENGTH);
  const encryptedData = vaultData.slice(4 + SALT_LENGTH + IV_LENGTH);

  onProgress?.({ stage: 'deriving-key', percent: 30, message: 'Deriving decryption key...' });

  const key = await deriveKey(password, salt);

  onProgress?.({ stage: 'decrypting', percent: 60, message: 'Decrypting file data...' });

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
  } catch {
    throw new Error('Decryption failed — wrong password or corrupted file');
  }

  // Extract metadata
  const view = new DataView(decrypted);
  const metaLen = view.getUint32(0);
  const metadataBytes = new Uint8Array(decrypted, 4, metaLen);
  const metadata: VaultMetadata = JSON.parse(new TextDecoder().decode(metadataBytes));

  const fileData = decrypted.slice(4 + metaLen);

  // Verify integrity
  const decryptedHash = await computeSHA256(fileData);

  onProgress?.({ stage: 'complete', percent: 100, message: 'Decryption complete!' });

  return {
    blob: new Blob([fileData], { type: metadata.fileType }),
    fileName: metadata.fileName,
    fileType: metadata.fileType,
    sha256: decryptedHash,
    storedSha256: metadata.sha256,
  };
}

export function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Very Weak', color: 'hsl(0, 80%, 55%)' },
    { label: 'Weak', color: 'hsl(30, 80%, 55%)' },
    { label: 'Fair', color: 'hsl(45, 80%, 55%)' },
    { label: 'Strong', color: 'hsl(90, 80%, 45%)' },
    { label: 'Very Strong', color: 'hsl(120, 100%, 50%)' },
  ];

  const idx = Math.min(score, levels.length) - 1;
  return { score, ...(levels[Math.max(0, idx)]) };
}
