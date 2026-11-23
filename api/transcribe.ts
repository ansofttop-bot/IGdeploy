import { handleTranscribePost } from "../src/routes/api/transcribe";

export async function POST(request: Request): Promise<Response> {
  return handleTranscribePost(request);
}
