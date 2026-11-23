import { handleChatPost } from "./_handlers.mjs";

export async function POST(request) {
  try {
    return await handleChatPost(request);
  } catch (err) {
    console.error("Vercel /api/chat error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
