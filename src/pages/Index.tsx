import { useState, useCallback, useEffect } from 'react';
import { Lock, Unlock, Shield, Eye, EyeOff, Upload, Download, X, Fingerprint, Copy, Check, AlertTriangle, Smartphone, FlaskConical, FileText, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { encryptFile, decryptFile, getPasswordStrength, computeSHA256, type EncryptionProgress, type DecryptionProgress } from '@/lib/crypto';
import MatrixRain from '@/components/MatrixRain';
import { useDecryptRateLimit } from '@/hooks/useDecryptRateLimit';
import { Link } from 'react-router-dom';

type Mode = 'home' | 'encrypt' | 'decrypt';

const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const Index = () => {
  const [mode, setMode] = useState<Mode>('home');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [fileHash, setFileHash] = useState('');
  const [resultHash, setResultHash] = useState('');
  const [storedHash, setStoredHash] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [largeFileWarning, setLargeFileWarning] = useState(false);
  const { rateLimited, cooldownSeconds, recordFailure, recordSuccess } = useDecryptRateLimit();

  const passwordStrength = password ? getPasswordStrength(password) : null;

  useEffect(() => {
    if (isMobileDevice()) setShowMobileWarning(true);
  }, []);

  const reset = () => {
    setFile(null);
    setPassword('');
    setShowPassword(false);
    setProcessing(false);
    setProgress(0);
    setStatusMessage('');
    setError('');
    setDone(false);
    setFileHash('');
    setResultHash('');
    setStoredHash('');
    setCopiedHash(null);
  };

  const copyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setDone(false);
    setFileHash('');
    setResultHash('');
    setStoredHash('');
    setLargeFileWarning(selectedFile.size > LARGE_FILE_THRESHOLD);
    try {
      const data = await selectedFile.arrayBuffer();
      const hash = await computeSHA256(data);
      setFileHash(hash);
    } catch {
      // non-critical
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleEncrypt = async () => {
    if (!file || !password) return;
    setProcessing(true);
    setError('');
    try {
      const result = await encryptFile(file, password, (p: EncryptionProgress) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
      });
      // Auto-download
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setResultHash(result.sha256);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Encryption failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!file || !password || rateLimited) return;
    setProcessing(true);
    setError('');
    try {
      const result = await decryptFile(file, password, (p: DecryptionProgress) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
      });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
      setResultHash(result.sha256);
      setStoredHash(result.storedSha256);
      setDone(true);
      recordSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decryption failed');
      recordFailure();
    } finally {
      setProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // HOME
  if (mode === 'home') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden py-8 md:py-0">
        <MatrixRain />
        <div className="relative z-10 flex flex-col items-center gap-6 md:gap-8 px-4 max-w-2xl w-full">
          {/* Logo & Title */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-xl border border-primary/30 flex items-center justify-center glow-green">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-mono font-bold text-primary text-glow-green tracking-tight">
              CipherVault
            </h1>
            <p className="text-muted-foreground text-center text-sm md:text-base font-mono">
              Client-side file encryption · Zero knowledge · No server uploads
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <Card
              className="cursor-pointer border-primary/20 bg-card/80 backdrop-blur-sm hover:border-primary/50 hover:glow-green transition-all duration-300 group"
              onClick={() => { reset(); setMode('encrypt'); }}
            >
              <CardContent className="flex flex-col items-center gap-3 py-8">
                <Lock className="w-10 h-10 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-lg font-mono font-semibold text-primary">Encrypt</span>
                <span className="text-xs text-muted-foreground text-center">
                  Lock your files with AES-256-GCM
                </span>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer border-vault-cyan/20 bg-card/80 backdrop-blur-sm hover:border-vault-cyan/50 hover:glow-cyan transition-all duration-300 group"
              onClick={() => { reset(); setMode('decrypt'); }}
            >
              <CardContent className="flex flex-col items-center gap-3 py-8">
                <Unlock className="w-10 h-10 text-accent group-hover:scale-110 transition-transform" />
                <span className="text-lg font-mono font-semibold text-accent">Decrypt</span>
                <span className="text-xs text-muted-foreground text-center">
                  Unlock .vault files with your password
                </span>
              </CardContent>
            </Card>
          </div>

          {/* How it works */}
          <div className="border border-border/50 rounded-lg p-4 bg-card/40 backdrop-blur-sm w-full">
            <h3 className="text-xs font-mono text-primary mb-2 uppercase tracking-wider">// How it works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground font-mono">
              <div className="flex gap-2">
                <span className="text-primary">01</span>
                <span>Select a file to encrypt or decrypt</span>
              </div>
              <div className="flex gap-2">
                <span className="text-primary">02</span>
                <span>Enter your secret password</span>
              </div>
              <div className="flex gap-2">
                <span className="text-primary">03</span>
                <span>Download the processed file</span>
              </div>
            </div>
          </div>

          {/* Advanced Lab link */}
          <Link to="/advanced-lab" className="w-full">
            <Card className="cursor-pointer border-destructive/20 bg-card/80 backdrop-blur-sm hover:border-destructive/50 transition-all duration-300 group">
              <CardContent className="flex items-center gap-4 py-4">
                <FlaskConical className="w-8 h-8 text-destructive group-hover:scale-110 transition-transform shrink-0" />
                <div>
                  <span className="text-base font-mono font-semibold text-destructive">Advanced Lab</span>
                  <p className="text-xs transition-colors duration-300" style={{ color: 'hsl(0deg 100% 65% / 90%)' }}>
                    Steganography · Challenge Mode · Multi-layer encryption
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Text Vault link */}
          <Link to="/text-vault" className="w-full">
            <Card className="cursor-pointer border-accent/20 bg-card/80 backdrop-blur-sm hover:border-accent/50 transition-all duration-300 group">
              <CardContent className="flex items-center gap-4 py-4">
                <FileText className="w-8 h-8 text-accent group-hover:scale-110 transition-transform shrink-0" />
                <div>
                  <span className="text-base font-mono font-semibold text-accent">Text Vault</span>
                  <p className="text-xs text-accent/60 group-hover:text-accent transition-colors duration-300">
                    Encrypted notepad · Write · Lock · Download · Decrypt later
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Dual Vault link */}
          <Link to="/dual-vault" className="w-full">
            <Card className="cursor-pointer border-primary/20 bg-card/80 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 group">
              <CardContent className="flex items-center gap-4 py-4">
                <Layers className="w-8 h-8 text-primary group-hover:scale-110 transition-transform shrink-0" />
                <div>
                  <span className="text-base font-mono font-semibold text-primary">Dual Vault</span>
                  <p className="text-xs text-primary/60 group-hover:text-primary transition-colors duration-300">
                    Plausible deniability · Dual-container encryption · CVLT v2
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Mobile warning */}
          {showMobileWarning && (
            <div className="border border-yellow-500/30 rounded-lg p-3 bg-yellow-500/5 w-full flex items-start gap-2">
              <Smartphone className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs font-mono text-yellow-500">
                Mobile devices have limited memory. Large files may cause slowdowns or crashes.
              </p>
              <button onClick={() => setShowMobileWarning(false)} className="text-yellow-500 hover:text-yellow-400 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Session indicator + security link */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
              <span>Session secure · All processing in-browser</span>
            </div>
            <Link to="/security" className="text-xs font-mono text-primary/60 hover:text-primary transition-colors underline underline-offset-2">
              View security model & threat documentation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ENCRYPT / DECRYPT
  const isEncrypt = mode === 'encrypt';
  const accentColor = isEncrypt ? 'primary' : 'accent';
  const acceptType = isEncrypt ? undefined : '.vault';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 w-full max-w-lg px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => { reset(); setMode('home'); }}
            className="text-muted-foreground hover:text-foreground font-mono text-sm transition-colors flex items-center gap-1"
          >
            ← back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-xs font-mono text-muted-foreground">secure session</span>
          </div>
        </div>

        <Card className={`border-${accentColor}/20 bg-card/80 backdrop-blur-sm`}>
          <CardContent className="p-6 space-y-5">
            {/* Title */}
            <div className="flex items-center gap-3">
              {isEncrypt ? (
                <Lock className="w-6 h-6 text-primary" />
              ) : (
                <Unlock className="w-6 h-6 text-accent" />
              )}
              <h2 className={`text-xl font-mono font-bold text-${accentColor}`}>
                {isEncrypt ? 'Encrypt File' : 'Decrypt File'}
              </h2>
            </div>

            {/* Drop Zone */}
            {!file ? (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-border/50 hover:border-primary/40'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  if (acceptType) input.accept = acceptType;
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFileSelect(f);
                  };
                  input.click();
                }}
              >
                <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-mono text-muted-foreground">
                  {isEncrypt ? 'Drop any file here or click to browse' : 'Drop a .vault file here or click to browse'}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 border border-border/50 rounded-lg p-3 bg-secondary/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{formatSize(file.size)}</p>
                </div>
                {!processing && (
                  <button onClick={() => { setFile(null); setDone(false); setError(''); }} className="text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Large file warning */}
            {largeFileWarning && file && (
              <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-destructive">
                  This file is {formatSize(file.size)}. Large files may use significant memory and cause slowdowns on some devices.
                </p>
              </div>
            )}

            {/* File SHA-256 Hash */}
            {fileHash && isEncrypt && (
              <div className="border border-border/50 rounded-lg p-3 bg-secondary/20 space-y-1">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-mono text-primary uppercase tracking-wider">SHA-256 Hash</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[10px] font-mono text-muted-foreground break-all flex-1 select-all">{fileHash}</code>
                  <button onClick={() => copyHash(fileHash, 'file')} className="text-muted-foreground hover:text-primary shrink-0">
                    {copiedHash === 'file' ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Password */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                Secret Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your secret password..."
                  className="pr-10 font-mono bg-secondary/30 border-border/50 focus:border-primary/50"
                  disabled={processing}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength indicator (encrypt only) */}
              {isEncrypt && passwordStrength && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 rounded-full"
                      style={{
                        width: `${(passwordStrength.score / 5) * 100}%`,
                        backgroundColor: passwordStrength.color,
                      }}
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

            {/* Error */}
            {error && (
              <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5">
                <p className="text-xs font-mono text-destructive">
                  {'>'} ERROR: {error}
                </p>
                {!isEncrypt && rateLimited && (
                  <p className="text-xs font-mono text-destructive mt-1">
                    {'>'} Rate limited — wait {cooldownSeconds}s before retrying
                  </p>
                )}
              </div>
            )}

            {/* Success */}
            {done && (
              <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-3">
                <p className="text-xs font-mono text-primary">
                  {'>'} {isEncrypt ? 'File encrypted and downloaded as .vault' : 'File decrypted and downloaded successfully'}
                </p>

                {/* Hash verification panel */}
                {isEncrypt && resultHash && (
                  <div className="border-t border-primary/20 pt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Original File Hash (stored in .vault)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-mono text-muted-foreground break-all flex-1 select-all">{resultHash}</code>
                      <button onClick={() => copyHash(resultHash, 'result')} className="text-muted-foreground hover:text-primary shrink-0">
                        {copiedHash === 'result' ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {!isEncrypt && resultHash && (
                  <div className="border-t border-primary/20 pt-2 space-y-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Stored Hash (from encryption)</span>
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-muted-foreground break-all flex-1 select-all">{storedHash}</code>
                        <button onClick={() => copyHash(storedHash, 'stored')} className="text-muted-foreground hover:text-primary shrink-0">
                          {copiedHash === 'stored' ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Decrypted File Hash</span>
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] font-mono text-muted-foreground break-all flex-1 select-all">{resultHash}</code>
                        <button onClick={() => copyHash(resultHash, 'decResult')} className="text-muted-foreground hover:text-primary shrink-0">
                          {copiedHash === 'decResult' ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 text-xs font-mono ${resultHash === storedHash ? 'text-primary' : 'text-destructive'}`}>
                      <Fingerprint className="w-3.5 h-3.5" />
                      {resultHash === storedHash
                        ? '✓ Integrity verified — hashes match'
                        : '✗ WARNING — hashes do not match! File may be corrupted'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Button */}
            <Button
              onClick={isEncrypt ? handleEncrypt : handleDecrypt}
              disabled={!file || !password || processing || (!isEncrypt && rateLimited)}
              className={`w-full font-mono font-semibold h-11 ${
                isEncrypt
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 glow-green'
                  : 'bg-accent text-accent-foreground hover:bg-accent/90 glow-cyan'
              }`}
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {isEncrypt ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  {isEncrypt ? 'Encrypt & Download' : 'Decrypt & Download'}
                </span>
              )}
            </Button>

            {/* No recovery warning */}
            {isEncrypt && (
              <div className="flex items-start gap-2 text-xs font-mono text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <span>
                  <strong className="text-destructive">No recovery possible.</strong> If you lose your password, your file cannot be decrypted. 
                  <Link to="/security" className="text-primary/60 hover:text-primary ml-1 underline underline-offset-2">Learn more</Link>
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
