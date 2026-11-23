import { handleTranscribePost } from "./_handlers.mjs";

export async function POST(request) {
  try {
    return await handleTranscribePost(request);
  } catch (err) {
    console.error("Vercel /api/transcribe error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
