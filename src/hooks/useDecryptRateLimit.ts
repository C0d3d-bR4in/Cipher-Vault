import { useState, useCallback, useRef } from 'react';

export function useDecryptRateLimit() {
  const [rateLimited, setRateLimited] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const failCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const recordFailure = useCallback(() => {
    failCountRef.current += 1;
    const delay = Math.min(2 + (failCountRef.current - 1) * 2, 30); // 2s, 4s, 6s ... max 30s
    setRateLimited(true);
    setCooldownSeconds(delay);

    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = delay;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCooldownSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setRateLimited(false);
      }
    }, 1000);
  }, []);

  const recordSuccess = useCallback(() => {
    failCountRef.current = 0;
    setRateLimited(false);
    setCooldownSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  return { rateLimited, cooldownSeconds, recordFailure, recordSuccess };
}
