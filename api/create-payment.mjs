import { handleCreatePaymentRequest } from "./_handlers.mjs";

async function run(request) {
  try {
    return await handleCreatePaymentRequest(request);
  } catch (err) {
    console.error("Vercel /api/create-payment error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export const POST = run;
