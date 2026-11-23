import { handleChatPost } from "../src/routes/api/chat";

export async function POST(request: Request): Promise<Response> {
  return handleChatPost(request);
}
