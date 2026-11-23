import { handleGitHubAuth } from "../../_handlers.mjs";

export async function POST(request) {
  try {
    return await handleGitHubAuth(request);
  } catch (err) {
    console.error("Vercel /api/auth/github/verify error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
