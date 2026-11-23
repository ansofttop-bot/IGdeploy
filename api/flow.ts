import { handleFlowRequest } from "../src/routes/api/flow";

export async function GET(request: Request): Promise<Response> {
  return handleFlowRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleFlowRequest(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleFlowRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleFlowRequest(request);
}
