function fallbackRequestId() {
  return `cm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function idempotencyKeyFor(requestRef, payload) {
  const fingerprint = JSON.stringify(payload);
  if (!requestRef.current || requestRef.current.fingerprint !== fingerprint) {
    requestRef.current = {
      fingerprint,
      key: window.crypto?.randomUUID?.() || fallbackRequestId(),
    };
  }
  return requestRef.current.key;
}

export function clearIdempotencyKey(requestRef) {
  requestRef.current = null;
}
