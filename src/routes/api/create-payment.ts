import { createFileRoute } from "@tanstack/react-router";
import { getUserFromToken } from "../../lib/memory-server";
import {
  PRO_CURRENCY,
  PRO_PRICE_RUB,
  createPlategaTransaction,
  isPlategaConfigured,
  markPendingTransactionOnProfile,
  sanitizeReturnUrl,
  savePaymentRecordInFirestore,
} from "../../lib/subscription-server";

export async function handleCreatePaymentRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const authed = await getUserFromToken(token);

    if (!authed || !authed.isJwt) {
      return Response.json(
        { error: "Необходима авторизация в аккаунте для оформления подписки." },
        { status: 401 },
      );
    }

    if (!isPlategaConfigured()) {
      return Response.json(
        { error: "Платёжный шлюз Platega не настроен на сервере (проверьте PLATEGA_MERCHANT_ID и PLATEGA_SECRET_KEY)." },
        { status: 503 },
      );
    }

    let body: Record<string, any> = {};
    try {
      body = (await request.json()) as Record<string, any>;
    } catch {
      body = {};
    }

    // 2 = СБП (QR), 11 = Банковская карта
    const paymentMethod: 2 | 11 = body.paymentMethod === 11 ? 11 : 2;
    const reqUrl = new URL(request.url);
    const originHeader = request.headers.get("origin") || `${reqUrl.protocol}//${reqUrl.host}`;
    const baseReturn = sanitizeReturnUrl(typeof body.returnUrl === "string" ? body.returnUrl : undefined, originHeader);
    const baseFailed = sanitizeReturnUrl(typeof body.failedUrl === "string" ? body.failedUrl : undefined, originHeader);

    const returnUrlObj = new URL(baseReturn);
    returnUrlObj.searchParams.set("payment", "success");
    const failedUrlObj = new URL(baseFailed);
    failedUrlObj.searchParams.set("payment", "failed");

    const email = typeof body.email === "string" ? body.email.trim().slice(0, 120) : undefined;

    const txn = await createPlategaTransaction({
      uid: authed.id,
      email,
      paymentMethod,
      returnUrl: returnUrlObj.toString(),
      failedUrl: failedUrlObj.toString(),
    });

    await Promise.allSettled([
      savePaymentRecordInFirestore(authed, {
        txnId: txn.transactionId,
        amount: PRO_PRICE_RUB,
        currency: PRO_CURRENCY,
        status: txn.status,
        purpose: "subscription_pro_30d",
      }),
      markPendingTransactionOnProfile(authed, txn.transactionId),
    ]);

    return Response.json({
      transactionId: txn.transactionId,
      paymentUrl: txn.paymentUrl,
      status: txn.status,
      amount: PRO_PRICE_RUB,
      currency: PRO_CURRENCY,
    });
  } catch (err: any) {
    console.error("[create-payment] Error:", err);
    return Response.json(
      { error: err?.message || "Не удалось создать платёж Platega." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/create-payment")({
  server: {
    handlers: {
      POST: ({ request }: any) => handleCreatePaymentRequest(request),
    },
  },
} as any);
