import * as jose from "jose";

export const generateJwt = async (
  channelId: string,
  secretKey: string,
): Promise<string> => {
  const header = { alg: "HS256", typ: "JWT" };
  return (
    new jose.SignJWT({
      channel_id: channelId,
    })
      .setProtectedHeader(header)
      // 30 秒後に有効期限切れ
      .setExpirationTime("30s")
      .sign(new TextEncoder().encode(secretKey))
  );
};
