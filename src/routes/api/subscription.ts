import { getUserFromToken } from "../../lib/memory-server";
import {
  LicenseKeyError,
  PRO_DURATION_DAYS,
  getUserSubscriptionStatus,
  redeemLicenseKey,
} from "../../lib/subscription-server";

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (request.headers.get("x-real-ip") || "unknown").trim().slice(0, 64);
}

export async function handleSubscriptionRequest(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const authed = await getUserFromToken(token);

    if (request.method === "GET") {
      if (!authed || !authed.isJwt) {
        return Response.json({
          plan: "free",
          isPro: false,
          status: "free",
          startedAt: null,
          expiresAt: null,
          daysLeft: 0,
          lastKeyId: null,
          durationDays: PRO_DURATION_DAYS,
        });
      }

      const state = await getUserSubscriptionStatus(authed);
      return Response.json(state);
    }

    if (request.method === "POST") {
      if (!authed || !authed.isJwt) {
        return Response.json(
          { error: "Войдите в аккаунт IGseek (через Google), чтобы активировать ключ Pro." },
          { status: 401 },
        );
      }

      let body: Record<string, any> = {};
      try {
        body = (await request.json()) as Record<string, any>;
      } catch {
        return Response.json({ error: "Некорректный JSON-запрос." }, { status: 400 });
      }

      const rawKey = String(body.key || body.licenseKey || body.code || "").trim();
      if (!rawKey) {
        return Response.json(
          { error: "Введите ключ активации формата IGSK-XXXX-XXXX-XXXX." },
          { status: 400 },
        );
      }

      const result = await redeemLicenseKey(authed, rawKey, {
        clientIp: getClientIp(request),
      });

      return Response.json(result);
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err: any) {
    if (err instanceof LicenseKeyError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[subscription] Error:", err);
    return Response.json(
      { error: err?.message || "Ошибка активации подписки." },
      { status: 500 },
    );
  }
}
