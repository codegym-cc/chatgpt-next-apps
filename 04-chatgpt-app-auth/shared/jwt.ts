import jwt, { type JwtPayload } from "jsonwebtoken";

export type AccessTokenClaims = JwtPayload & {
  iss: string;
  sub: string;
  aud: string | string[];
  scope: string;
  name?: string;
};

export function signAccessToken(params: {
  issuer: string;
  subject: string;
  audience: string;
  scope: string;
  name?: string;
  secret: string;
  ttlSec: number;
}): { token: string; expiresIn: number; claims: AccessTokenClaims } {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + params.ttlSec;

  const claims: AccessTokenClaims = {
    iss: params.issuer,
    sub: params.subject,
    aud: params.audience,
    iat: nowSec,
    exp,
    scope: params.scope,
    ...(params.name ? { name: params.name } : {}),
  };

  const token = jwt.sign(claims, params.secret, { algorithm: "HS256" });

  return { token, expiresIn: params.ttlSec, claims };
}

export function verifyAccessToken(
  token: string,
  params: { secret: string; issuer: string; audience: string }
): AccessTokenClaims {
  const decoded = jwt.verify(token, params.secret, {
    algorithms: ["HS256"],
    issuer: params.issuer,
    audience: params.audience,
  });

  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  const payload = decoded as AccessTokenClaims;

  // minimal structural checks (jwt.verify already checked exp/iss/aud)
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Token missing sub");
  }
  if (typeof payload.scope !== "string") {
    throw new Error("Token missing scope");
  }
  if (typeof payload.iss !== "string") {
    throw new Error("Token missing iss");
  }

  return payload;
}