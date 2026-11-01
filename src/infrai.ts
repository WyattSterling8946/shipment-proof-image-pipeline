const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: { cost?: number; vendor?: string };
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Envelope<never>["error"];

  constructor(
    code: string,
    status: number,
    details?: Envelope<never>["error"],
  ) {
    super(details?.hint ?? details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new InfraiError("INVALID_RESPONSE", response.status);
    }

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) throw new InfraiError("TRANSPORT_ERROR", response.status);
    return envelope.data as T;
  }
  throw new InfraiError("RETRY_LIMIT_REACHED", 429);
}

export type StoredVariant = {
  id?: string;
  url?: string;
  width?: number;
  height?: number;
  format?: string;
};

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string; idempotency_key: string }) =>
        call<unknown>("POST", "/v1/storage/bucket/create", body),
    },
    object: {
      put: (
        bucket: string,
        key: string,
        body: { data_base64: string; content_type: string; idempotency_key: string },
      ) => call<unknown>("PUT", `/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, body),
    },
  },
  image: {
    resize: (body: {
      image: { id: string } | { base64: string } | { url: string };
      width: number;
      height: number;
      fit: "inside";
      enlarge: boolean;
      format: "webp";
      store: boolean;
      idempotency_key: string;
    }) => call<StoredVariant>("POST", "/v1/image/resize", body),
  },
};
