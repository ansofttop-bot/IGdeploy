import { handleLegalRequest } from "./_handlers.mjs";

export async function GET(request) {
  try {
    return await handleLegalRequest(request);
  } catch (err) {
    console.error("Vercel /api/legal error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
