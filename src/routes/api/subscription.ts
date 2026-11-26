import { getUserFromToken } from "../../lib/memory-server";
import {
  PRO_DURATION_DAYS,
  PRO_PRICE_RUB,
  getUserSubscriptionStatus,
  isPlategaConfigured,
  verifyAndActivatePlategaTransaction,
} from "../../lib/subscription-server";

export async function handleSubscriptionRequest(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const authed = await getUserFromToken(token);

    if (!authed || !authed.isJwt) {
      return Response.json({
        plan: "free",
        isPro: false,
        status: "free",
        startedAt: null,
        expiresAt: null,
        daysLeft: 0,
        lastTxnId: null,
        pendingTxnId: null,
        priceRub: PRO_PRICE_RUB,
        durationDays: PRO_DURATION_DAYS,
        paymentConfigured: isPlategaConfigured(),
      });
    }

    if (request.method === "GET") {
      const url = new URL(request.url);
      const pendingTxnId = url.searchParams.get("txnId") || url.searchParams.get("transactionId") || null;
      const state = await getUserSubscriptionStatus(authed, pendingTxnId);
      return Response.json({
        ...state,
        paymentConfigured: isPlategaConfigured(),
      });
    }

    if (request.method === "POST") {
      let body: Record<string, any> = {};
      try {
        body = (await request.json()) as Record<string, any>;
      } catch {
        return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
      }

      const txnId = String(body.transactionId || body.txnId || "").trim();
      if (!txnId) {
        // Fallback: refresh status and check any stored pending txn
        const state = await getUserSubscriptionStatus(authed);
        return Response.json({
          verified: state.isPro,
          paymentStatus: state.isPro ? "CONFIRMED" : state.pendingTxnId ? "PENDING" : "UNKNOWN",
          subscription: state,
          paymentConfigured: isPlategaConfigured(),
        });
      }

      if (!isPlategaConfigured()) {
        return Response.json(
          { error: "Платёжный шлюз Platega не настроен на сервере." },
          { status: 503 },
        );
      }

      const result = await verifyAndActivatePlategaTransaction(authed, txnId);
      return Response.json({
        ...result,
        paymentConfigured: true,
      });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (err: any) {
    console.error("[subscription] Error:", err);
    return Response.json(
      { error: err?.message || "Ошибка проверки подписки." },
      { status: 500 },
    );
  }
}
