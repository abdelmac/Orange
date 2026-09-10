import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

z.config(z.locales.fr());

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(
    JSON.parse(
      JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    ),
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (!origin || origin !== expected)
    throw new HttpError(403, "Origine de la requête non autorisée. Rechargez la page.");
}

export async function readBoundedBody(
  request: Request,
  limit = 1_000_000,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new HttpError(413, "Requête trop volumineuse.");
  if (!request.body) throw new HttpError(400, "Corps de requête manquant.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Requête trop volumineuse.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(request: Request): Promise<unknown> {
  const bytes = await readBoundedBody(request);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Corps JSON invalide.");
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return json(
      {
        error: error.issues
          .map((issue) => `${issue.path.join(".") || "Champ"} : ${issue.message}`)
          .join(" · "),
      },
      400,
    );
  if (error instanceof Error && "status" in error && typeof error.status === "number")
    return json({ error: error.message }, error.status);
  if (typeof error === "object" && error && "code" in error) {
    if (error.code === "P2002")
      return json({ error: "Cette valeur existe déjà. Vérifiez les informations saisies." }, 409);
    if (error.code === "P2025") return json({ error: "Élément introuvable." }, 404);
  }
  console.error("API failure", error instanceof Error ? error.message : "Unknown error");
  return json(
    { error: "L’opération n’a pas pu être effectuée. Réessayez ou contactez un administrateur." },
    500,
  );
}

export async function withApi(work: () => Promise<Response | unknown>) {
  try {
    const result = await work();
    return result instanceof Response ? result : json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const api = withApi;
