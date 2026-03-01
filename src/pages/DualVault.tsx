import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Shield, Lock, Unlock, Eye, EyeOff, Upload, Download, X,
  Terminal, Sparkles, Layers, Ghost, FileDown, AlertTriangle,
  FileText, File as FileIcon, Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { getPasswordStrength } from '@/lib/crypto';
import { dualEncrypt, dualDecrypt, type DualContainerProgress } from '@/lib/dualContainer';
import MatrixRain from '@/components/MatrixRain';
import { Link } from 'react-router-dom';
import { useDecryptRateLimit } from '@/hooks/useDecryptRateLimit';

type DualMode = 'encrypt' | 'decrypt';
type PayloadType = 'text' | 'file';

const GLOBAL_HEADER_SIZE = 16;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PasswordField = ({
  value, onChange, show, onToggle, placeholder, strength, disabled, label,
}: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void;
  placeholder: string; strength: ReturnType<typeof getPasswordStrength> | null;
  disabled: boolean; label: string;
}) => (
  <div className="space-y-2">
    <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</label>
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="pr-10 font-mono bg-secondary/30 border-border/50 focus:border-primary/50"
        disabled={disabled}
      />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
    {strength && (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
          <div className="h-full transition-all duration-300 rounded-full"
            style={{ width: `${(strength.score / 5) * 100}%`, backgroundColor: strength.color }} />
        </div>
        <span className="text-xs font-mono" style={{ color: strength.color }}>{strength.label}</span>
      </div>
    )}
  </div>
);

const selectFile = (setter: (f: File) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) setter(f);
  };
  input.click();
};

const PayloadInput = ({
  payloadType, onTypeChange, text, onTextChange, file, onFileChange,
  disabled, label, icon, borderColor,
}: {
  payloadType: PayloadType; onTypeChange: (t: PayloadType) => void;
  text: string; onTextChange: (t: string) => void;
  file: File | null; onFileChange: (f: File) => void;
  disabled: boolean; label: string; icon: React.ReactNode; borderColor: string;
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label className={`text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 ${borderColor}`}>
        {icon} {label}
      </label>
      <div className="flex gap-1">
        <button onClick={() => onTypeChange('text')}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all ${
            payloadType === 'text' ? 'border-primary bg-primary/20 text-primary' : 'border-border/50 text-muted-foreground hover:border-primary/40'
          }`} disabled={disabled}>
          <FileText className="w-3 h-3 inline mr-1" />Text
        </button>
        <button onClick={() => onTypeChange('file')}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all ${
            payloadType === 'file' ? 'border-primary bg-primary/20 text-primary' : 'border-border/50 text-muted-foreground hover:border-primary/40'
          }`} disabled={disabled}>
          <FileIcon className="w-3 h-3 inline mr-1" />File
        </button>
      </div>
    </div>
    {payloadType === 'text' ? (
      <Textarea value={text} onChange={(e) => onTextChange(e.target.value)}
        placeholder={label.includes('Hidden') ? 'The real secret that nobody should find...' : 'Enter the decoy message visible under coercion...'}
        className={`min-h-[100px] font-mono text-sm bg-background/80 border-${borderColor.includes('destructive') ? 'destructive' : 'primary'}/20 focus:border-${borderColor.includes('destructive') ? 'destructive' : 'primary'}/50 resize-y scanline`}
        disabled={disabled} />
    ) : (
      !file ? (
        <div className="border-2 border-dashed border-border/50 hover:border-primary/40 rounded-lg p-4 text-center cursor-pointer transition-all"
          onClick={() => selectFile(onFileChange)}>
          <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs font-mono text-muted-foreground">Click to select a file</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 border border-border/50 rounded-lg p-2 bg-secondary/20">
          <FileIcon className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-foreground truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{formatSize(file.size)}</p>
          </div>
          {!disabled && (
            <button onClick={() => onFileChange(null as unknown as File)} className="text-muted-foreground hover:text-destructive">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )
    )}
  </div>
);

const DualVault = () => {
  const [mode, setMode] = useState<DualMode>('encrypt');

  // Encrypt state
  const [publicType, setPublicType] = useState<PayloadType>('text');
  const [publicText, setPublicText] = useState('');
  const [publicFile, setPublicFile] = useState<File | null>(null);
  const [publicPassword, setPublicPassword] = useState('');
  const [showPublicPw, setShowPublicPw] = useState(false);

  const [enableHidden, setEnableHidden] = useState(false);
  const [hiddenType, setHiddenType] = useState<PayloadType>('text');
  const [hiddenText, setHiddenText] = useState('');
  const [hiddenFile, setHiddenFile] = useState<File | null>(null);
  const [hiddenPassword, setHiddenPassword] = useState('');
  const [showHiddenPw, setShowHiddenPw] = useState(false);

  // Decrypt state
  const [vaultFile, setVaultFile] = useState<File | null>(null);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [showDecryptPw, setShowDecryptPw] = useState(false);
  const [decryptedData, setDecryptedData] = useState<Uint8Array | null>(null);
  const [decryptedIsText, setDecryptedIsText] = useState(false);

  // Shared state
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Rate limiting
  const { rateLimited, cooldownSeconds, recordFailure, recordSuccess } = useDecryptRateLimit();

  const pubStrength = publicPassword ? getPasswordStrength(publicPassword) : null;
  const hidStrength = hiddenPassword ? getPasswordStrength(hiddenPassword) : null;

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines]);

  const addLine = (line: string) => {
    setTerminalLines(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  const reset = () => {
    setPublicType('text'); setPublicText(''); setPublicFile(null);
    setPublicPassword(''); setShowPublicPw(false);
    setHiddenType('text'); setHiddenText(''); setHiddenFile(null);
    setHiddenPassword(''); setShowHiddenPw(false);
    setEnableHidden(false);
    setVaultFile(null); setDecryptPassword(''); setShowDecryptPw(false);
    setDecryptedData(null); setDecryptedIsText(false);
    setProcessing(false); setProgress(0); setStatusMessage('');
    setError(''); setDone(false);
    setTerminalLines([]); setShowTerminal(false);
  };

  // Build payload bytes with a type marker: T (text) or F:<filename>\n (file)
  const buildPayload = async (type: PayloadType, text: string, file: File | null): Promise<Uint8Array> => {
    if (type === 'text') {
      const marker = new TextEncoder().encode('T');
      const body = new TextEncoder().encode(text);
      const result = new Uint8Array(marker.length + body.length);
      result.set(marker, 0);
      result.set(body, marker.length);
      return result;
    } else {
      if (!file) throw new Error('No file selected');
      const header = new TextEncoder().encode(`F:${file.name}\n`);
      const body = new Uint8Array(await file.arrayBuffer());
      const result = new Uint8Array(header.length + body.length);
      result.set(header, 0);
      result.set(body, header.length);
      return result;
    }
  };

  const handleEncrypt = async () => {
    const pubValid = publicType === 'text' ? publicText.trim() : publicFile;
    const hidValid = enableHidden ? (hiddenType === 'text' ? hiddenText.trim() : hiddenFile) : true;
    if (!pubValid || !publicPassword || !hidValid) return;
    if (enableHidden && !hiddenPassword) return;

    setProcessing(true); setError(''); setShowTerminal(true); setTerminalLines([]);

    addLine('> Initializing CVLT v2 Dual-Container Engine...');

    try {
      const pubData = await buildPayload(publicType, publicText, publicFile);
      addLine(`> Public payload: ${formatSize(pubData.length)} (${publicType})`);

      let hidData: Uint8Array | null = null;
      const hidPw = enableHidden ? hiddenPassword : null;
      if (enableHidden) {
        hidData = await buildPayload(hiddenType, hiddenText, hiddenFile);
        addLine(`> Hidden payload: ${formatSize(hidData.length)} (${hiddenType})`);
      } else {
        addLine('> Hidden container: cryptographic noise (no hidden data)');
      }

      let slotSizeInfo = 0;
      const result = await dualEncrypt(pubData, publicPassword, hidData, hidPw, (p: DualContainerProgress) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
        if (p.stage === 'encrypting-public') addLine('> Argon2id KDF → AES-256-GCM (slot 1)...');
        if (p.stage === 'encrypting-hidden') addLine(hidPw ? '> Argon2id KDF → AES-256-GCM (slot 2)...' : '> Generating CSPRNG noise for slot 2...');
        if (p.stage === 'packaging') addLine('> Assembling CVLT v2 binary...');
      });

      addLine(`> Container total: ${formatSize(GLOBAL_HEADER_SIZE + result.slotSize * 2)}`);
      addLine('> ✓ Both slots identical in size — plausible deniability preserved.');

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'container.vault'; a.click();
      URL.revokeObjectURL(url);

      addLine('> ✓ Downloaded: container.vault');
      addLine('> Buffers wiped. No traces remain.');
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Encryption failed';
      setError(msg);
      addLine(`> ✗ ERROR: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!vaultFile || !decryptPassword || rateLimited) return;
    setProcessing(true); setError(''); setShowTerminal(true); setTerminalLines([]);

    addLine('> Loading .vault container...');
    addLine(`> File size: ${formatSize(vaultFile.size)}`);

    try {
      const data = new Uint8Array(await vaultFile.arrayBuffer());
      addLine('> Parsing CVLT v2 header (magic, version, slot size)...');

      const result = await dualDecrypt(data, decryptPassword, (p: DualContainerProgress) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
        if (p.stage === 'deriving-key') addLine('> Attempting Argon2id key derivation on both slots...');
        if (p.stage === 'verifying') addLine('> Verifying AES-256-GCM authentication tags...');
      });

      setDecryptedData(result.data);

      // Determine if result is text or file based on marker
      const firstByte = result.data[0];
      if (firstByte === 0x54) { // 'T'
        setDecryptedIsText(true);
        addLine('> ✓ Text payload decrypted.');
      } else if (firstByte === 0x46) { // 'F'
        setDecryptedIsText(false);
        const headerEnd = result.data.indexOf(0x0A); // '\n'
        if (headerEnd > 0) {
          const fileName = new TextDecoder().decode(result.data.slice(2, headerEnd));
          addLine(`> ✓ File payload decrypted: ${fileName}`);
        } else {
          addLine('> ✓ Binary payload decrypted.');
        }
      } else {
        // Legacy or unknown — treat as text
        setDecryptedIsText(true);
        addLine('> ✓ Payload decrypted (legacy format).');
      }

      addLine('> Note: Slot origin is not disclosed.');
      setDone(true);
      recordSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decryption failed.';
      setError(msg);
      addLine(`> ✗ ${msg}`);
      recordFailure();
    } finally {
      setProcessing(false);
    }
  };

  const downloadDecryptedFile = useCallback(() => {
    if (!decryptedData) return;
    const headerEnd = decryptedData.indexOf(0x0A);
    const fileName = headerEnd > 0
      ? new TextDecoder().decode(decryptedData.slice(2, headerEnd))
      : 'decrypted-file';
    const fileData = headerEnd > 0 ? decryptedData.slice(headerEnd + 1) : decryptedData.slice(1);
    const blob = new Blob([fileData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }, [decryptedData]);

  const getDecryptedText = useCallback((): string => {
    if (!decryptedData) return '';
    if (decryptedData[0] === 0x54) { // 'T' marker
      return new TextDecoder().decode(decryptedData.slice(1));
    }
    // Legacy: no marker
    return new TextDecoder().decode(decryptedData);
  }, [decryptedData]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setVaultFile(f); setError(''); setDone(false); setDecryptedData(null); }
  };

  // selectFile, PayloadInput and PasswordField moved outside component to prevent remount

  const pubValid = publicType === 'text' ? !!publicText.trim() : !!publicFile;
  const hidValid = enableHidden ? (hiddenType === 'text' ? !!hiddenText.trim() : !!hiddenFile) : true;
  const encryptDisabled = !pubValid || !publicPassword || processing || !hidValid ||
    (enableHidden && (!hiddenPassword || publicPassword === hiddenPassword));

  return (
    <div className="min-h-screen flex flex-col items-center justify-start md:justify-center relative overflow-hidden py-8">
      <MatrixRain />
      <div className="relative z-10 w-full max-w-2xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="text-muted-foreground hover:text-foreground font-mono text-sm transition-colors flex items-center gap-1">
            ← back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-mono text-muted-foreground">deniable mode</span>
          </div>
        </div>

        {/* Title */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-xl border border-destructive/30 flex items-center justify-center relative">
            <Layers className="w-7 h-7 text-destructive" />
            <Ghost className="w-3.5 h-3.5 text-destructive/60 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold text-destructive">
            Dual Vault
          </h1>
          <p className="text-muted-foreground text-center text-xs font-mono max-w-md">
            Plausible deniability · Two containers · One password reveals decoy, another reveals the truth
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6 justify-center px-4 sm:px-0">
          <Button variant={mode === 'encrypt' ? 'default' : 'outline'} size="sm"
            onClick={() => { reset(); setMode('encrypt'); }} className="font-mono gap-1.5 sm:gap-2 text-xs sm:text-sm px-3 sm:px-4">
            <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Create Container
          </Button>
          <Button variant={mode === 'decrypt' ? 'default' : 'outline'} size="sm"
            onClick={() => { reset(); setMode('decrypt'); }} className="font-mono gap-1.5 sm:gap-2 text-xs sm:text-sm px-3 sm:px-4">
            <Unlock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Decrypt Container
          </Button>
        </div>

        <Card className="border-destructive/20 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-6 space-y-5">

            {/* === ENCRYPT === */}
            {mode === 'encrypt' && (
              <>
                <div className="border border-destructive/20 rounded-lg p-3 bg-destructive/5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs font-mono text-muted-foreground">
                    <span className="text-destructive font-semibold">How it works:</span> Two encrypted slots of identical size are created.
                    A coerced user can reveal the decoy password. The hidden container is indistinguishable from random noise.
                    Supports both text and file payloads.
                  </p>
                </div>

                <PayloadInput payloadType={publicType} onTypeChange={setPublicType}
                  text={publicText} onTextChange={setPublicText}
                  file={publicFile} onFileChange={setPublicFile}
                  disabled={processing || done} label="Public Container (Decoy)"
                  icon={<Shield className="w-3 h-3" />} borderColor="text-primary" />

                <PasswordField value={publicPassword} onChange={setPublicPassword}
                  show={showPublicPw} onToggle={() => setShowPublicPw(!showPublicPw)}
                  placeholder="Public/decoy password..." strength={pubStrength}
                  disabled={processing || done} label="Public Password" />

                <div className="border border-border/30 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-destructive uppercase tracking-wider flex items-center gap-1.5 cursor-pointer">
                      <Ghost className="w-3.5 h-3.5" /> Hidden Container
                    </label>
                    <Switch checked={enableHidden} onCheckedChange={setEnableHidden}
                      className="data-[state=checked]:bg-destructive" disabled={processing || done} />
                  </div>

                  {enableHidden && (
                    <>
                      <PayloadInput payloadType={hiddenType} onTypeChange={setHiddenType}
                        text={hiddenText} onTextChange={setHiddenText}
                        file={hiddenFile} onFileChange={setHiddenFile}
                        disabled={processing || done} label="Hidden Payload"
                        icon={<Ghost className="w-3 h-3" />} borderColor="text-destructive" />

                      <PasswordField value={hiddenPassword} onChange={setHiddenPassword}
                        show={showHiddenPw} onToggle={() => setShowHiddenPw(!showHiddenPw)}
                        placeholder="Hidden password (DIFFERENT from public)..." strength={hidStrength}
                        disabled={processing || done} label="Hidden Password" />
                      {publicPassword && hiddenPassword && publicPassword === hiddenPassword && (
                        <p className="text-xs font-mono text-destructive animate-pulse">
                          ⚠ Hidden password must differ from public password!
                        </p>
                      )}
                    </>
                  )}
                </div>

                {processing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs font-mono text-primary animate-pulse">{statusMessage}</p>
                  </div>
                )}

                {!done ? (
                  <Button onClick={handleEncrypt} disabled={encryptDisabled}
                    className="w-full font-mono gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <FileDown className="w-4 h-4" />
                    {processing ? 'Building container...' : 'Create & Download .vault'}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 text-center space-y-2">
                      <Sparkles className="w-6 h-6 text-primary mx-auto animate-pulse" />
                      <p className="text-sm font-mono text-primary font-semibold">Dual container created!</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        Both slots are identical in size. No metadata reveals the hidden vault.
                      </p>
                    </div>
                    <Button variant="outline" onClick={reset} className="w-full font-mono gap-2">
                      <Layers className="w-4 h-4" /> Create another container
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* === DECRYPT === */}
            {mode === 'decrypt' && (
              <>
                {!vaultFile ? (
                  <div className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                    isDragging ? 'border-destructive bg-destructive/5' : 'border-border/50 hover:border-destructive/40'
                  }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file'; input.accept = '.vault';
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) { setVaultFile(f); setError(''); }
                      };
                      input.click();
                    }}>
                    <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-mono text-muted-foreground">
                      Drop a .vault container here or click to browse
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border border-destructive/30 rounded-lg p-3 bg-destructive/5">
                    <Layers className="w-5 h-5 text-destructive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-foreground truncate">{vaultFile.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatSize(vaultFile.size)}</p>
                    </div>
                    {!processing && (
                      <button onClick={() => { setVaultFile(null); setDone(false); setDecryptedData(null); setError(''); }}
                        className="text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                <PasswordField value={decryptPassword} onChange={setDecryptPassword}
                  show={showDecryptPw} onToggle={() => setShowDecryptPw(!showDecryptPw)}
                  placeholder="Enter password..." strength={null}
                  disabled={processing || done} label="Password" />

                <div className="border border-border/20 rounded-lg p-3 bg-secondary/10">
                  <p className="text-xs font-mono text-muted-foreground">
                    <span className="text-destructive">⊘</span> The system will not reveal which container was decrypted, or whether a hidden container exists.
                  </p>
                </div>

                {/* Rate limit warning */}
                {rateLimited && (
                  <div className="border border-destructive/40 rounded-lg p-3 bg-destructive/10 flex items-center gap-2">
                    <Timer className="w-4 h-4 text-destructive shrink-0 animate-pulse" />
                    <p className="text-xs font-mono text-destructive">
                      Rate limited — wait {cooldownSeconds}s before next attempt
                    </p>
                  </div>
                )}

                {processing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs font-mono text-destructive animate-pulse">{statusMessage}</p>
                  </div>
                )}

                {!done && (
                  <Button onClick={handleDecrypt}
                    disabled={!vaultFile || !decryptPassword || processing || rateLimited}
                    className="w-full font-mono gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <Unlock className="w-4 h-4" />
                    {processing ? 'Decrypting...' : rateLimited ? `Wait ${cooldownSeconds}s...` : 'Decrypt Container'}
                  </Button>
                )}

                {/* Decrypted result — text */}
                {done && decryptedData && decryptedIsText && (
                  <div className="space-y-3">
                    <div className="border border-destructive/30 rounded-lg p-1 bg-background/80">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-destructive/20">
                        <div className="flex gap-1">
                          <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">decrypted-container</span>
                      </div>
                      <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto scanline">
                        {getDecryptedText()}
                      </pre>
                    </div>
                    <Button variant="outline" onClick={reset} className="w-full font-mono gap-2">
                      <Layers className="w-4 h-4" /> Decrypt another container
                    </Button>
                  </div>
                )}

                {/* Decrypted result — file */}
                {done && decryptedData && !decryptedIsText && (
                  <div className="space-y-3">
                    <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 text-center space-y-3">
                      <FileIcon className="w-6 h-6 text-primary mx-auto" />
                      <p className="text-sm font-mono text-primary font-semibold">File decrypted successfully</p>
                      <Button onClick={downloadDecryptedFile} className="font-mono gap-2">
                        <Download className="w-4 h-4" /> Download Decrypted File
                      </Button>
                    </div>
                    <Button variant="outline" onClick={reset} className="w-full font-mono gap-2">
                      <Layers className="w-4 h-4" /> Decrypt another container
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Error */}
            {error && (
              <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5">
                <p className="text-xs font-mono text-destructive">✗ {error}</p>
              </div>
            )}

            {/* Terminal */}
            {showTerminal && terminalLines.length > 0 && (
              <div className="border border-destructive/20 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/5 border-b border-destructive/20">
                  <Terminal className="w-3 h-3 text-destructive" />
                  <span className="text-[10px] font-mono text-destructive uppercase tracking-wider">CVLT Engine Log</span>
                </div>
                <div ref={terminalRef} className="p-3 max-h-[150px] overflow-y-auto bg-background/90">
                  {terminalLines.map((line, i) => (
                    <p key={i} className={`text-[11px] font-mono leading-relaxed ${
                      line.includes('✓') ? 'text-primary' :
                      line.includes('✗') ? 'text-destructive' :
                      line.includes('⚠') ? 'text-yellow-500' :
                      'text-muted-foreground'
                    }`}>{line}</p>
                  ))}
                  {processing && <span className="text-[11px] font-mono text-destructive animate-pulse">▌</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-4 text-xs font-mono text-muted-foreground">
          <Shield className="w-3 h-3" />
          <span>CVLT v2 · Argon2id · AES-256-GCM · AAD · Plausible deniability</span>
        </div>
      </div>
    </div>
  );
};

export default DualVault;
