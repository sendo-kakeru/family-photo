import * as jose from "jose";

/**
 * Cloudflare Access JWT を検証する
 */
export async function verifyCloudflareAccessJWT(
  accessJwt: string,
  teamDomain: string,
  audience: string,
): Promise<jose.JWTVerifyResult> {
  const certsUrl = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const JWKS = jose.createRemoteJWKSet(new URL(certsUrl));

  return await jose.jwtVerify(accessJwt, JWKS, {
    audience,
  });
}
