import { Shield, AlertTriangle, Lock, Key, FileWarning, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import MatrixRain from '@/components/MatrixRain';

const Section = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
  <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
    <CardContent className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-mono font-bold text-primary">{title}</h2>
      </div>
      <div className="text-sm text-muted-foreground font-mono space-y-2">{children}</div>
    </CardContent>
  </Card>
);

const Security = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate('/')}
            className="text-muted-foreground hover:text-foreground font-mono text-sm transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> back
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 mb-8">
          <Shield className="w-12 h-12 text-primary" />
          <h1 className="text-3xl md:text-4xl font-mono font-bold text-primary text-glow-green">
            Security Model
          </h1>
          <p className="text-muted-foreground text-center text-sm font-mono">
            Transparency & trust through documentation
          </p>
        </div>

        {/* No Recovery Warning */}
        <Card className="border-destructive/40 bg-destructive/5 backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h2 className="text-lg font-mono font-bold text-destructive">⚠ No Recovery Possible</h2>
                <p className="text-sm text-muted-foreground font-mono">
                  If you lose your password, your encrypted files <strong className="text-destructive">cannot be recovered</strong>. 
                  There is no master key, no backdoor, no server-side copy. CipherVault is designed with zero-knowledge 
                  architecture — we never see your password or your files.
                </p>
                <p className="text-sm text-muted-foreground font-mono">
                  <strong className="text-foreground">Always</strong> store your password in a secure password manager.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cryptographic Design */}
        <Section title="Cryptographic Design" icon={Key}>
          <p><strong className="text-foreground">Algorithm:</strong> AES-256-GCM (authenticated encryption with associated data)</p>
          <p><strong className="text-foreground">Key Derivation:</strong></p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>User password is processed via <code className="text-primary">PBKDF2</code> with 100,000 iterations using SHA-256</li>
            <li>A random 32-byte salt is generated per file using <code className="text-primary">crypto.getRandomValues()</code></li>
            <li>The PBKDF2 output is fed into <code className="text-primary">HKDF</code> with the per-file salt and info string "CipherVault-AES256GCM"</li>
            <li>The final AES-256-GCM key is derived — unique per file, per password</li>
          </ol>
          <p><strong className="text-foreground">IV:</strong> 12-byte random nonce generated per encryption via <code className="text-primary">crypto.getRandomValues()</code></p>
          <p><strong className="text-foreground">Integrity:</strong> SHA-256 hash of the original file is computed and stored inside the encrypted payload. Upon decryption, the hash is recomputed and compared.</p>
        </Section>

        {/* Threat Model */}
        <Section title="Threat Model" icon={Shield}>
          <p><strong className="text-foreground">What CipherVault protects against:</strong></p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Unauthorized access to files at rest (encrypted files are indistinguishable from random data)</li>
            <li>Server compromise — no files or passwords ever leave your browser</li>
            <li>Man-in-the-middle — all crypto runs locally via the Web Crypto API</li>
            <li>Brute force — PBKDF2 with 100k iterations + client-side rate limiting with exponential backoff</li>
            <li>File tampering — AES-GCM authentication tag + SHA-256 integrity verification</li>
          </ul>
          <p className="mt-3"><strong className="text-foreground">What CipherVault does NOT protect against:</strong></p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Compromised device — if your machine has malware, keyloggers can capture your password</li>
            <li>Weak passwords — a short or guessable password undermines all cryptographic protections</li>
            <li>Browser vulnerabilities — CipherVault trusts the browser's Web Crypto API implementation</li>
            <li>Physical access while the app is open — files exist in memory during processing</li>
            <li>Password loss — there is absolutely no recovery mechanism by design</li>
          </ul>
        </Section>

        {/* Vault File Format */}
        <Section title=".vault File Format" icon={Lock}>
          <div className="bg-secondary/30 rounded-lg p-3 font-mono text-xs">
            <p className="text-primary mb-1">// Binary layout</p>
            <p>Bytes 0–3: &nbsp;&nbsp;Magic bytes "VLT1" (0x56 0x4C 0x54 0x31)</p>
            <p>Bytes 4–35: &nbsp;Salt (32 bytes, random)</p>
            <p>Bytes 36–47: IV (12 bytes, random nonce)</p>
            <p>Bytes 48+: &nbsp;&nbsp;AES-256-GCM ciphertext</p>
            <p className="text-primary mt-2">// Plaintext structure (before encryption)</p>
            <p>Bytes 0–3: &nbsp;&nbsp;Metadata length (uint32, big-endian)</p>
            <p>Bytes 4–N: &nbsp;&nbsp;JSON metadata (filename, type, size, sha256)</p>
            <p>Bytes N+: &nbsp;&nbsp;Original file data</p>
          </div>
        </Section>

        {/* Security Features */}
        <Section title="Security Features" icon={FileWarning}>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong className="text-foreground">Zero-knowledge:</strong> All processing happens in your browser. Nothing is sent to any server.</li>
            <li><strong className="text-foreground">No persistence:</strong> No data is stored in localStorage, cookies, or any browser storage.</li>
            <li><strong className="text-foreground">Memory cleanup:</strong> File data is released from memory after processing.</li>
            <li><strong className="text-foreground">CSP headers:</strong> Content-Security-Policy restricts loading to self-origin only.</li>
            <li><strong className="text-foreground">Rate limiting:</strong> Failed decryption attempts trigger exponential delays to prevent brute force.</li>
            <li><strong className="text-foreground">Password strength:</strong> Real-time strength indicator encourages strong passwords during encryption.</li>
          </ul>
        </Section>

        <div className="text-center text-xs font-mono text-muted-foreground pt-4">
          CipherVault is open and auditable. All cryptographic operations use the browser's native Web Crypto API.
        </div>
      </div>
    </div>
  );
};

export default Security;
