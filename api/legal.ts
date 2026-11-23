import { handleLegalRequest } from "../src/routes/api/legal";

export async function GET(request: Request): Promise<Response> {
  return handleLegalRequest(request);
}
