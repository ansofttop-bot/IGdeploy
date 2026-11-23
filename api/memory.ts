import { handleMemoryRequest } from "../src/routes/api/memory";

export async function GET(request: Request): Promise<Response> {
  return handleMemoryRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMemoryRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMemoryRequest(request);
}
