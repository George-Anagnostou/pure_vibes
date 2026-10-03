import "server-only";
import { z } from "zod";
import { trustedOrigins } from "@/lib/env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !trustedOrigins().has(origin)) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(415, "Use application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues[0]?.message ?? "Invalid request.",
    );
  return parsed.data;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  const requestId = crypto.randomUUID();
  console.error("request_failed", {
    requestId,
    type: error instanceof Error ? error.name : "UnknownError",
  });
  return json(
    {
      error: "The request failed. Check server configuration and try again.",
      requestId,
    },
    500,
  );
}
