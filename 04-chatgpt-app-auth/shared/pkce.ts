import crypto from "node:crypto";

export function base64urlEncode(input: Buffer | Uint8Array): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function sha256(input: string): Buffer {
  return crypto.createHash("sha256").update(input).digest();
}

export function computeS256CodeChallenge(codeVerifier: string): string {
  return base64urlEncode(sha256(codeVerifier));
}

export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}