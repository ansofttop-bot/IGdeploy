import {
  PRO_CURRENCY,
  PRO_PRICE_RUB,
  extractUidFromPayload,
  getPlategaTransactionStatus,
  normalizePlategaStatus,
  recordConfirmedWebhook,
  verifyPlategaWebhookAuth,
} from "../../lib/subscription-server";

export async function handlePaymentWebhookRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Strictly authenticate webhook sender using constant-time X-MerchantId & X-Secret verification
  if (!verifyPlategaWebhookAuth(request.headers)) {
    return Response.json({ error: "Unauthorized webhook signature" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, any>;
    const txnId = String(body.id || body.transactionId || "").trim();
    if (!txnId || !/^[a-zA-Z0-9_-]{4,128}$/.test(txnId)) {
      return Response.json({ error: "Invalid transaction id" }, { status: 400 });
    }

    const reportedStatus = normalizePlategaStatus(body.status);
    let confirmedStatus = reportedStatus;
    let amount = Number(body.amount ?? body.paymentDetails?.amount ?? PRO_PRICE_RUB);
    let currency = String(body.currency ?? body.paymentDetails?.currency ?? PRO_CURRENCY).toUpperCase();
    let uid = extractUidFromPayload(body.payload);

    // Cross-check directly with Platega API for defense-in-depth before recording confirmation
    try {
      const liveInfo = await getPlategaTransactionStatus(txnId);
      confirmedStatus = liveInfo.status;
      if (liveInfo.amount > 0) amount = liveInfo.amount;
      if (liveInfo.currency) currency = liveInfo.currency;
      if (liveInfo.payloadUid) uid = liveInfo.payloadUid;
    } catch (err) {
      console.warn("[payment-webhook] Live verification skipped/failed:", err instanceof Error ? err.message : String(err));
    }

    if (confirmedStatus === "CONFIRMED") {
      recordConfirmedWebhook({
        txnId,
        uid,
        amount,
        currency,
        status: "CONFIRMED",
        confirmedAt: new Date().toISOString(),
      });
    }

    return Response.json({ ok: true, id: txnId, status: confirmedStatus });
  } catch (err: any) {
    console.error("[payment-webhook] Error:", err);
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
