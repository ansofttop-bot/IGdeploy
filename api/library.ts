import { handleLibraryRequest } from "../src/routes/api/library";

export async function GET(request: Request): Promise<Response> {
  return handleLibraryRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleLibraryRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleLibraryRequest(request);
}
