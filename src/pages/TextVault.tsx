import { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Lock, Unlock, Download, Upload, Eye, EyeOff, X, Sparkles, Terminal, Clock, Hash, Trash2, Bomb, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { encryptFile, decryptFile, getPasswordStrength } from '@/lib/crypto';
import MatrixRain from '@/components/MatrixRain';
import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';

type VaultMode = 'write' | 'decrypt';

const SELF_DESTRUCT_OPTIONS = [10, 30, 60, 120] as const;

const TYPING_PROMPTS = [
  'Begin typing your secret message...',
  'Your words are safe here...',
  'Nobody can read this but you...',
  'Write something worth encrypting...',
  'The void awaits your secrets...',
];

const TextVault = () => {
  const [mode, setMode] = useState<VaultMode>('write');
  const [noteText, setNoteText] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [decryptedText, setDecryptedText] = useState('');
  const [vaultFile, setVaultFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [typingPrompt] = useState(() => TYPING_PROMPTS[Math.floor(Math.random() * TYPING_PROMPTS.length)]);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [selfDestructEnabled, setSelfDestructEnabled] = useState(false);
  const [selfDestructSeconds, setSelfDestructSeconds] = useState<number>(30);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const passwordStrength = password ? getPasswordStrength(password) : null;

  useEffect(() => {
    setCharCount(new Blob([noteText]).size);
  }, [noteText]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  const addTerminalLine = (line: string) => {
    setTerminalLines(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
  };

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const selfDestruct = useCallback(() => {
    clearCountdown();
    setDecryptedText('');
    setDone(false);
    addTerminalLine('> ☠ SELF-DESTRUCT: Decrypted note purged from memory.');
  }, [clearCountdown]);

  const startCountdown = useCallback((seconds: number) => {
    clearCountdown();
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          selfDestruct();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearCountdown, selfDestruct]);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const reset = () => {
    clearCountdown();
    setNoteText('');
    setPassword('');
    setShowPassword(false);
    setProcessing(false);
    setProgress(0);
    setStatusMessage('');
    setError('');
    setDone(false);
    setDecryptedText('');
    setVaultFile(null);
    setTerminalLines([]);
    setShowTerminal(false);
  };

  const handleEncrypt = async () => {
    if (!noteText.trim() || !password) return;
    setProcessing(true);
    setError('');
    setShowTerminal(true);
    setTerminalLines([]);

    addTerminalLine('> Initializing CipherVault Text Engine...');

    try {
      const textBlob = new Blob([noteText], { type: 'text/plain' });
      const textFile = new File([textBlob], 'note.txt', { type: 'text/plain' });

      addTerminalLine(`> Payload size: ${charCount} bytes`);
      addTerminalLine('> Generating cryptographic salt (256-bit)...');

      const result = await encryptFile(textFile, password, (p) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
        if (p.stage === 'deriving-key') addTerminalLine('> PBKDF2 + HKDF key derivation in progress...');
        if (p.stage === 'encrypting') addTerminalLine('> AES-256-GCM encryption engaged...');
        if (p.stage === 'packaging') addTerminalLine('> Packaging into .vaultnote format...');
      });

      addTerminalLine('> ✓ Encryption complete. Integrity hash stored.');
      addTerminalLine(`> SHA-256: ${result.sha256.slice(0, 16)}...`);

      // Rename to .vaultnote
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'encrypted-note.vaultnote';
      a.click();
      URL.revokeObjectURL(url);

      addTerminalLine('> ✓ File downloaded: encrypted-note.vaultnote');
      addTerminalLine('> Session memory cleared. Stay safe, operator.');
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Encryption failed';
      setError(msg);
      addTerminalLine(`> ✗ ERROR: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!vaultFile || !password) return;
    setProcessing(true);
    setError('');
    setShowTerminal(true);
    setTerminalLines([]);

    addTerminalLine('> Loading .vaultnote file...');
    addTerminalLine(`> File size: ${vaultFile.size} bytes`);

    try {
      addTerminalLine('> Parsing vault header & magic bytes...');

      const result = await decryptFile(vaultFile, password, (p) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
        if (p.stage === 'deriving-key') addTerminalLine('> Reconstructing encryption key...');
        if (p.stage === 'decrypting') addTerminalLine('> AES-256-GCM decryption in progress...');
      });

      const text = await result.blob.text();
      setDecryptedText(text);

      const integrityOk = result.sha256 === result.storedSha256;
      addTerminalLine(integrityOk
        ? '> ✓ Integrity verified — SHA-256 matches.'
        : '> ⚠ WARNING: Integrity mismatch! File may be tampered.');
      addTerminalLine('> ✓ Decryption successful. Note revealed.');
      if (selfDestructEnabled) {
        addTerminalLine(`> ☠ Self-destruct armed: ${selfDestructSeconds}s countdown started.`);
        startCountdown(selfDestructSeconds);
      }
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Decryption failed';
      setError(msg);
      addTerminalLine(`> ✗ ERROR: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setVaultFile(f); setError(''); setDone(false); setDecryptedText(''); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden py-8">
      <MatrixRain />
      <div className="relative z-10 w-full max-w-2xl px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground font-mono text-sm transition-colors flex items-center gap-1"
          >
            ← back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-xs font-mono text-muted-foreground">text vault active</span>
          </div>
        </div>

        {/* Title */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-xl border border-primary/30 flex items-center justify-center glow-green relative">
            <FileText className="w-7 h-7 text-primary" />
            <Sparkles className="w-3 h-3 text-accent absolute -top-1 -right-1 animate-pulse-glow" />
          </div>
          <h1 className="text-2xl md:text-3xl font-mono font-bold text-primary text-glow-green">
            Text Vault
          </h1>
          <p className="text-muted-foreground text-center text-xs font-mono">
            Encrypted notepad · Write · Lock · Download · Decrypt later
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6 justify-center">
          <Button
            variant={mode === 'write' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { reset(); setMode('write'); }}
            className="font-mono gap-2"
          >
            <Lock className="w-3.5 h-3.5" /> Write & Encrypt
          </Button>
          <Button
            variant={mode === 'decrypt' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { reset(); setMode('decrypt'); }}
            className="font-mono gap-2"
          >
            <Unlock className="w-3.5 h-3.5" /> Decrypt Note
          </Button>
        </div>

        <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-6 space-y-5">

            {/* === WRITE MODE === */}
            {mode === 'write' && (
              <>
                {/* Notepad */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-3 h-3" /> Secret Note
                    </label>
                    <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" /> {noteText.length} chars
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {charCount} bytes
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={typingPrompt}
                      className="min-h-[200px] font-mono text-sm bg-background/80 border-primary/20 focus:border-primary/50 resize-y scanline"
                      disabled={processing || done}
                    />
                    {noteText && !processing && !done && (
                      <button
                        onClick={() => setNoteText('')}
                        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                        title="Clear note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Encryption Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter a strong password..."
                      className="pr-10 font-mono bg-secondary/30 border-border/50 focus:border-primary/50"
                      disabled={processing || done}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordStrength && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{ width: `${(passwordStrength.score / 5) * 100}%`, backgroundColor: passwordStrength.color }}
                        />
                      </div>
                      <span className="text-xs font-mono" style={{ color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress */}
                {processing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs font-mono text-primary animate-pulse-glow">{statusMessage}</p>
                  </div>
                )}

                {/* Action */}
                {!done ? (
                  <Button
                    onClick={handleEncrypt}
                    disabled={!noteText.trim() || !password || processing}
                    className="w-full font-mono gap-2 glow-green"
                  >
                    <Lock className="w-4 h-4" />
                    {processing ? 'Encrypting...' : 'Encrypt & Download .vaultnote'}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 text-center space-y-2">
                      <Sparkles className="w-6 h-6 text-primary mx-auto animate-pulse-glow" />
                      <p className="text-sm font-mono text-primary font-semibold">Note encrypted & downloaded!</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        Your .vaultnote file is safe. Only your password can unlock it.
                      </p>
                    </div>
                    <Button variant="outline" onClick={reset} className="w-full font-mono gap-2">
                      <FileText className="w-4 h-4" /> Write another note
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* === DECRYPT MODE === */}
            {mode === 'decrypt' && (
              <>
                {/* File drop */}
                {!vaultFile ? (
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                      isDragging ? 'border-accent bg-accent/5' : 'border-border/50 hover:border-accent/40'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.vaultnote,.vault';
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) { setVaultFile(f); setError(''); }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-mono text-muted-foreground">
                      Drop a .vaultnote file here or click to browse
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 border border-accent/30 rounded-lg p-3 bg-accent/5">
                    <FileText className="w-5 h-5 text-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-foreground truncate">{vaultFile.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{vaultFile.size} bytes</p>
                    </div>
                    {!processing && (
                      <button onClick={() => { setVaultFile(null); setDone(false); setDecryptedText(''); setError(''); }}
                        className="text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {/* Password */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Decryption Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter the password used to encrypt..."
                      className="pr-10 font-mono bg-secondary/30 border-border/50 focus:border-accent/50"
                      disabled={processing || done}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Progress */}
                {processing && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs font-mono text-accent animate-pulse-glow">{statusMessage}</p>
                  </div>
                )}

                {/* Self-Destruct Option */}
                {!done && (
                  <div className="border border-destructive/20 rounded-lg p-3 bg-destructive/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-destructive/80 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer">
                        <Bomb className="w-3.5 h-3.5" /> Self-Destruct Timer
                      </label>
                      <Switch
                        checked={selfDestructEnabled}
                        onCheckedChange={setSelfDestructEnabled}
                        className="data-[state=checked]:bg-destructive"
                      />
                    </div>
                    {selfDestructEnabled && (
                      <div className="flex gap-2">
                        {SELF_DESTRUCT_OPTIONS.map(s => (
                          <button
                            key={s}
                            onClick={() => setSelfDestructSeconds(s)}
                            className={`flex-1 text-xs font-mono py-1.5 rounded border transition-all ${
                              selfDestructSeconds === s
                                ? 'border-destructive bg-destructive/20 text-destructive'
                                : 'border-border/50 text-muted-foreground hover:border-destructive/40'
                            }`}
                          >
                            {s}s
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Decrypt button */}
                {!done && (
                  <Button
                    onClick={handleDecrypt}
                    disabled={!vaultFile || !password || processing}
                    className="w-full font-mono gap-2 bg-accent text-accent-foreground hover:bg-accent/90 glow-cyan"
                  >
                    <Unlock className="w-4 h-4" />
                    {processing ? 'Decrypting...' : 'Decrypt Note'}
                  </Button>
                )}

                {/* Decrypted result */}
                {done && decryptedText && (
                  <div className="space-y-3">
                    {/* Countdown bar */}
                    {countdown !== null && (
                      <div className="border border-destructive/40 rounded-lg p-3 bg-destructive/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-destructive flex items-center gap-1.5 animate-pulse">
                            <Bomb className="w-3.5 h-3.5" /> Self-destruct in {countdown}s
                          </span>
                          <button
                            onClick={clearCountdown}
                            className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          >
                            <TimerReset className="w-3 h-3" /> Disarm
                          </button>
                        </div>
                        <div className="h-1.5 bg-destructive/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-destructive rounded-full transition-all duration-1000 ease-linear"
                            style={{ width: `${(countdown / selfDestructSeconds) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="border border-accent/30 rounded-lg p-1 bg-background/80">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/20">
                        <div className="flex gap-1">
                          <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                          <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">decrypted-note.txt</span>
                      </div>
                      <pre className="p-4 text-sm font-mono text-foreground whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto scanline">
                        {decryptedText}
                      </pre>
                    </div>
                    <Button variant="outline" onClick={reset} className="w-full font-mono gap-2">
                      <FileText className="w-4 h-4" /> Decrypt another note
                    </Button>
                  </div>
                )}
                {/* Self-destructed state */}
                {done && !decryptedText && (
                  <div className="space-y-3">
                    <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5 text-center space-y-2">
                      <Bomb className="w-6 h-6 text-destructive mx-auto" />
                      <p className="text-sm font-mono text-destructive font-semibold">Note self-destructed</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        The decrypted content has been purged from memory.
                      </p>
                    </div>
                    <Button variant="outline" onClick={reset} className="w-full font-mono gap-2">
                      <FileText className="w-4 h-4" /> Decrypt another note
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

            {/* Terminal Output */}
            {showTerminal && terminalLines.length > 0 && (
              <div className="border border-primary/20 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b border-primary/20">
                  <Terminal className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Crypto Engine Log</span>
                </div>
                <div ref={terminalRef} className="p-3 max-h-[150px] overflow-y-auto bg-background/90">
                  {terminalLines.map((line, i) => (
                    <p key={i} className={`text-[11px] font-mono leading-relaxed ${
                      line.includes('✓') ? 'text-primary' :
                      line.includes('✗') ? 'text-destructive' :
                      line.includes('⚠') ? 'text-yellow-500' :
                      'text-muted-foreground'
                    }`}>
                      {line}
                    </p>
                  ))}
                  {processing && (
                    <span className="text-[11px] font-mono text-primary animate-pulse-glow">▌</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-4 text-xs font-mono text-muted-foreground">
          <Lock className="w-3 h-3" />
          <span>AES-256-GCM · PBKDF2 + HKDF · Zero knowledge</span>
        </div>
      </div>
    </div>
  );
};

export default TextVault;
