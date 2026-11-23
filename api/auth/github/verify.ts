import { handleGitHubAuth } from "../../../src/routes/api/auth-github";

export async function POST(request: Request): Promise<Response> {
  return handleGitHubAuth(request);
}
