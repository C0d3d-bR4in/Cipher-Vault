import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Image, Lock, Unlock, Eye, EyeOff, Upload, Download, X,
  AlertTriangle, Shield, Layers, Clock, KeyRound, MessageSquare,
  ArrowLeft, Copy, Check, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import MatrixRain from '@/components/MatrixRain';
import {
  stegoEncodeFixed,
  stegoDecode,
  challengeEncrypt,
  challengeDecrypt,
  getMaxMessageLength,
  type StegoProgress,
  type ChallengeConfig,
} from '@/lib/stego';

const MAX_RESOLUTION = 4096 * 4096;

const TEST_PNG_SIZES = [
  { label: '256×256', w: 256, h: 256 },
  { label: '512×512', w: 512, h: 512 },
  { label: '1024×1024', w: 1024, h: 1024 },
];

function generateTestPNG(width: number, height: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Create a visually interesting gradient pattern
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a1628');
    gradient.addColorStop(0.3, '#0d3320');
    gradient.addColorStop(0.6, '#1a1a3e');
    gradient.addColorStop(1, '#0a1628');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add some noise-like pattern for better steganographic capacity
    const imageData = ctx.getImageData(0, 0, width, height);
    const rng = () => Math.random();
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] += Math.floor(rng() * 10);
      imageData.data[i + 1] += Math.floor(rng() * 10);
      imageData.data[i + 2] += Math.floor(rng() * 10);
      imageData.data[i + 3] = 255; // fully opaque
    }
    ctx.putImageData(imageData, 0, 0);

    // Draw a subtle grid
    ctx.strokeStyle = 'rgba(0,255,128,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = 'rgba(0,255,128,0.15)';
    ctx.font = `${Math.max(12, width / 20)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('CipherVault Test', width / 2, height / 2);

    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Failed to generate PNG'));
        const file = new File([blob], `test_${width}x${height}.png`, { type: 'image/png' });
        resolve(file);
      },
      'image/png'
    );
  });
}

const AdvancedLab = () => {
  return (
    <div className="min-h-screen flex flex-col items-center relative overflow-hidden">
      <MatrixRain />
      <div className="relative z-10 w-full max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground font-mono text-sm transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-xs font-mono text-muted-foreground">secure session</span>
          </div>
        </div>

        {/* Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg border border-accent/30 flex items-center justify-center glow-cyan">
            <Shield className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-mono font-bold text-accent text-glow-cyan">Advanced Lab</h1>
            <p className="text-xs font-mono text-muted-foreground">Steganography · Challenge Mode</p>
          </div>
        </div>

        <Tabs defaultValue="encode" className="w-full">
          <TabsList className="w-full bg-secondary/50 border border-border/50 h-auto flex-wrap">
            <TabsTrigger value="encode" className="flex-1 font-mono text-[10px] sm:text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary px-2 sm:px-3">
              <Image className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" /> Stego Encode
            </TabsTrigger>
            <TabsTrigger value="decode" className="flex-1 font-mono text-[10px] sm:text-xs data-[state=active]:bg-accent/10 data-[state=active]:text-accent px-2 sm:px-3">
              <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" /> Stego Decode
            </TabsTrigger>
            <TabsTrigger value="challenge" className="flex-1 font-mono text-[10px] sm:text-xs data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive px-2 sm:px-3">
              <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" /> Challenge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="encode">
            <StegoEncoder />
          </TabsContent>
          <TabsContent value="decode">
            <StegoDecoder />
          </TabsContent>
          <TabsContent value="challenge">
            <ChallengeMode />
          </TabsContent>
        </Tabs>

        {/* Security info */}
        <div className="mt-6 border border-border/50 rounded-lg p-4 bg-card/40 backdrop-blur-sm">
          <h3 className="text-xs font-mono text-primary mb-2 uppercase tracking-wider">// Security Rules</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground font-mono">
            <div className="flex gap-2 items-start"><span className="text-primary">✔</span> PNG only for steganography</div>
            <div className="flex gap-2 items-start"><span className="text-primary">✔</span> Argon2id key derivation</div>
            <div className="flex gap-2 items-start"><span className="text-primary">✔</span> AES-256-GCM encryption</div>
            <div className="flex gap-2 items-start"><span className="text-primary">✔</span> Randomized pixel embedding</div>
            <div className="flex gap-2 items-start"><span className="text-primary">✔</span> Encrypt before embed</div>
            <div className="flex gap-2 items-start"><span className="text-primary">✔</span> All processing in-browser</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── STEGO ENCODER ───────────────────────────────────────────
const StegoEncoder = () => {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);
  const [resWarning, setResWarning] = useState(false);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/png')) {
      setError('Only PNG files are supported');
      return;
    }
    setFile(selectedFile);
    setError('');
    setDone(false);

    const img = new window.Image();
    img.onload = () => {
      setImageInfo({ width: img.width, height: img.height });
      setResWarning(img.width * img.height > MAX_RESOLUTION);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(selectedFile);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  const handleEncode = async () => {
    if (!file || !message || !password) return;
    setProcessing(true);
    setError('');
    try {
      const blob = await stegoEncodeFixed(file, message, password, (p: StegoProgress) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.png$/i, '') + '_stego.png';
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Encoding failed');
    } finally {
      setProcessing(false);
    }
  };

  const maxChars = imageInfo ? getMaxMessageLength(imageInfo.width, imageInfo.height) : 0;

  return (
    <Card className="border-primary/20 bg-card/80 backdrop-blur-sm mt-3">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-mono font-semibold text-primary">Stego Image Encoder</h3>
        </div>

        {/* File upload */}
        {!file ? (
          <div className="space-y-2">
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                isDragging ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/40'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/png';
                input.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) handleFileSelect(f);
                };
                input.click();
              }}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs font-mono text-muted-foreground">Drop a PNG image or click to browse</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">or generate:</span>
              {TEST_PNG_SIZES.map((s) => (
                <button
                  key={s.label}
                  onClick={async () => {
                    try {
                      const f = await generateTestPNG(s.w, s.h);
                      handleFileSelect(f);
                    } catch { setError('Failed to generate test image'); }
                  }}
                  className="px-2 py-1 text-[10px] sm:text-xs font-mono border border-primary/30 rounded bg-primary/5 text-primary hover:bg-primary/15 transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 border border-border/50 rounded-lg p-3 bg-secondary/30">
            <Image className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-foreground truncate">{file.name}</p>
              {imageInfo && (
                <p className="text-xs text-muted-foreground font-mono">
                  {imageInfo.width}×{imageInfo.height} · Max ~{maxChars.toLocaleString()} chars
                </p>
              )}
            </div>
            {!processing && (
              <button onClick={() => { setFile(null); setImageInfo(null); setDone(false); setError(''); }}>
                <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
        )}

        {resWarning && (
          <div className="border border-yellow-500/30 rounded-lg p-2 bg-yellow-500/5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs font-mono text-yellow-500">High resolution image — processing may be slow.</p>
          </div>
        )}

        {/* Message */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Secret Message</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your secret message..."
            className="font-mono bg-secondary/30 border-border/50 focus:border-primary/50 text-sm min-h-[80px]"
            disabled={processing}
          />
          {imageInfo && message.length > 0 && (
            <p className={`text-xs font-mono ${message.length > maxChars ? 'text-destructive' : 'text-muted-foreground'}`}>
              {message.length}/{maxChars.toLocaleString()} chars
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Password</Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Encryption password..."
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
        </div>

        {processing && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-2" />
            <p className="text-xs font-mono text-primary animate-pulse-glow">{statusMessage}</p>
          </div>
        )}

        {error && (
          <div className="border border-destructive/30 rounded-lg p-2 bg-destructive/5">
            <p className="text-xs font-mono text-destructive">{'>'} ERROR: {error}</p>
          </div>
        )}

        {done && (
          <div className="border border-primary/30 rounded-lg p-3 bg-primary/5">
            <p className="text-xs font-mono text-primary">{'>'} Stego image downloaded! Message hidden successfully.</p>
          </div>
        )}

        <Button
          onClick={handleEncode}
          disabled={!file || !message || !password || processing || (imageInfo ? message.length > maxChars : false)}
          className="w-full font-mono glow-green"
        >
          <Lock className="w-4 h-4 mr-2" />
          Encrypt + Embed
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── STEGO DECODER ───────────────────────────────────────────
const StegoDecoder = () => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [decodedMessage, setDecodedMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/png')) {
      setError('Only PNG files are supported');
      return;
    }
    setFile(selectedFile);
    setError('');
    setDecodedMessage('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, [handleFileSelect]);

  const handleDecode = async () => {
    if (!file || !password) return;
    setProcessing(true);
    setError('');
    setDecodedMessage('');
    try {
      const msg = await stegoDecode(file, password, (p: StegoProgress) => {
        setProgress(p.percent);
        setStatusMessage(p.message);
      });
      setDecodedMessage(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decoding failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card className="border-accent/20 bg-card/80 backdrop-blur-sm mt-3">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Unlock className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-mono font-semibold text-accent">Stego Image Decoder</h3>
        </div>

        {!file ? (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
              isDragging ? 'border-accent bg-accent/5' : 'border-border/50 hover:border-accent/40'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/png';
              input.onchange = (e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) handleFileSelect(f);
              };
              input.click();
            }}
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs font-mono text-muted-foreground">Drop a stego PNG or click to browse</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 border border-border/50 rounded-lg p-3 bg-secondary/30">
            <Image className="w-5 h-5 text-accent shrink-0" />
            <p className="text-sm font-mono text-foreground truncate flex-1">{file.name}</p>
            {!processing && (
              <button onClick={() => { setFile(null); setDecodedMessage(''); setError(''); }}>
                <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Password</Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Decryption password..."
              className="pr-10 font-mono bg-secondary/30 border-border/50 focus:border-accent/50"
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
        </div>

        {processing && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-2" />
            <p className="text-xs font-mono text-accent animate-pulse-glow">{statusMessage}</p>
          </div>
        )}

        {error && (
          <div className="border border-destructive/30 rounded-lg p-2 bg-destructive/5">
            <p className="text-xs font-mono text-destructive">{'>'} ERROR: {error}</p>
          </div>
        )}

        {decodedMessage && (
          <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-primary uppercase tracking-wider">Decrypted Message</span>
              <button
                onClick={() => { navigator.clipboard.writeText(decodedMessage); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="text-muted-foreground hover:text-primary"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">{decodedMessage}</p>
          </div>
        )}

        <Button
          onClick={handleDecode}
          disabled={!file || !password || processing}
          className="w-full font-mono bg-accent text-accent-foreground hover:bg-accent/90 glow-cyan"
        >
          <Unlock className="w-4 h-4 mr-2" />
          Extract + Decrypt
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── CHALLENGE MODE ──────────────────────────────────────────
const ChallengeMode = () => {
  const [tab, setTab] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [message, setMessage] = useState('');
  const [passwords, setPasswords] = useState(['', '']);
  const [secretPhrase, setSecretPhrase] = useState('');
  const [layers, setLayers] = useState(2);
  const [timeLock, setTimeLock] = useState(3);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  const updatePassword = (idx: number, val: string) => {
    const updated = [...passwords];
    updated[idx] = val;
    setPasswords(updated);
  };

  const adjustLayers = (n: number) => {
    setLayers(n);
    const updated = [...passwords];
    while (updated.length < n) updated.push('');
    setPasswords(updated.slice(0, n));
  };

  const handleProcess = async () => {
    if (!message || passwords.some((p) => !p)) return;
    setProcessing(true);
    setError('');
    setResult('');

    const config: ChallengeConfig = {
      layers,
      passwords,
      secretPhrase: secretPhrase || undefined,
      timeLockIterations: timeLock,
    };

    try {
      if (tab === 'encrypt') {
        const encrypted = await challengeEncrypt(message, config, (p) => {
          setProgress(p.percent);
          setStatusMessage(p.message);
        });
        setResult(encrypted);
      } else {
        const decrypted = await challengeDecrypt(message, config, (p) => {
          setProgress(p.percent);
          setStatusMessage(p.message);
        });
        setResult(decrypted);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card className="border-destructive/20 bg-card/80 backdrop-blur-sm mt-3">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-destructive" />
          <h3 className="text-lg font-mono font-semibold text-destructive">Challenge Mode</h3>
        </div>

        <p className="text-xs font-mono text-muted-foreground">
          Multi-layer encrypted puzzle with time-lock and multi-password unlock.
        </p>

        {/* Encrypt / Decrypt toggle */}
        <div className="flex gap-2">
          <Button
            variant={tab === 'encrypt' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setTab('encrypt'); setResult(''); setError(''); }}
            className="font-mono text-xs flex-1"
          >
            <Lock className="w-3.5 h-3.5 mr-1" /> Create Puzzle
          </Button>
          <Button
            variant={tab === 'decrypt' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setTab('decrypt'); setResult(''); setError(''); }}
            className="font-mono text-xs flex-1"
          >
            <Unlock className="w-3.5 h-3.5 mr-1" /> Solve Puzzle
          </Button>
        </div>

        {/* Message / Cipher input */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            {tab === 'encrypt' ? 'Secret Message' : 'Encrypted Puzzle'}
          </Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={tab === 'encrypt' ? 'Enter your message...' : 'Paste the encrypted puzzle...'}
            className="font-mono bg-secondary/30 border-border/50 text-sm min-h-[60px]"
            disabled={processing}
          />
        </div>

        {/* Layers */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3 h-3" /> Encryption Layers: {layers}
          </Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                variant={layers === n ? 'default' : 'outline'}
                size="sm"
                onClick={() => adjustLayers(n)}
                className="font-mono text-xs w-10"
                disabled={processing}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>

        {/* Passwords per layer */}
        <div className="space-y-2">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <KeyRound className="w-3 h-3" /> Passwords ({layers})
          </Label>
          {passwords.slice(0, layers).map((pw, i) => (
            <Input
              key={i}
              type="password"
              value={pw}
              onChange={(e) => updatePassword(i, e.target.value)}
              placeholder={`Layer ${i + 1} password...`}
              className="font-mono bg-secondary/30 border-border/50 text-sm"
              disabled={processing}
            />
          ))}
        </div>

        {/* Secret Phrase */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" /> Secret Phrase (optional)
          </Label>
          <Input
            value={secretPhrase}
            onChange={(e) => setSecretPhrase(e.target.value)}
            placeholder="Additional verification phrase..."
            className="font-mono bg-secondary/30 border-border/50 text-sm"
            disabled={processing}
          />
        </div>

        {/* Time Lock */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Time Lock (Argon2 iterations): {timeLock}
          </Label>
          <div className="flex gap-2">
            {[1, 3, 5, 10, 20].map((n) => (
              <Button
                key={n}
                variant={timeLock === n ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeLock(n)}
                className="font-mono text-xs"
                disabled={processing}
              >
                {n}x
              </Button>
            ))}
          </div>
          <p className="text-xs font-mono text-muted-foreground">Higher = slower to crack, but also slower to unlock.</p>
        </div>

        {processing && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-2" />
            <p className="text-xs font-mono text-primary animate-pulse-glow">{statusMessage}</p>
          </div>
        )}

        {error && (
          <div className="border border-destructive/30 rounded-lg p-2 bg-destructive/5">
            <p className="text-xs font-mono text-destructive">{'>'} ERROR: {error}</p>
          </div>
        )}

        {result && (
          <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-primary uppercase tracking-wider">
                {tab === 'encrypt' ? 'Encrypted Puzzle' : 'Decrypted Message'}
              </span>
              <button
                onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="text-muted-foreground hover:text-primary"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{result}</p>
          </div>
        )}

        <Button
          onClick={handleProcess}
          disabled={!message || passwords.slice(0, layers).some((p) => !p) || processing}
          className="w-full font-mono"
        >
          {tab === 'encrypt' ? (
            <><Lock className="w-4 h-4 mr-2" /> Create Encrypted Puzzle</>
          ) : (
            <><Unlock className="w-4 h-4 mr-2" /> Solve Puzzle</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AdvancedLab;
