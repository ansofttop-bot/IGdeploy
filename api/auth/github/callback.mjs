import { handleGitHubAuth } from "../../_handlers.mjs";

export async function GET(request) {
  try {
    return await handleGitHubAuth(request);
  } catch (err) {
    console.error("Vercel /api/auth/github/callback error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
