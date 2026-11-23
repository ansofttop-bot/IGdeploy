import { handleLibraryRequest } from "./_handlers.mjs";

async function run(request) {
  try {
    return await handleLibraryRequest(request);
  } catch (err) {
    console.error("Vercel /api/library error:", err);
    return Response.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
export const DELETE = run;
