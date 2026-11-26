import { handlePaymentWebhookRequest } from "./_handlers.mjs";

async function run(request) {
  try {
    return await handlePaymentWebhookRequest(request);
  } catch (err) {
    console.error("Vercel /api/payment-webhook error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = run;
