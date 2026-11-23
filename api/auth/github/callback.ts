import { handleGitHubAuth } from "../../../src/routes/api/auth-github";

export async function GET(request: Request): Promise<Response> {
  return handleGitHubAuth(request);
}
