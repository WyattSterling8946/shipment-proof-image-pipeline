import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai.js";
import { processShipmentEvent } from "./proof_pipeline.js";
import { shipmentEventSchema } from "./shipment_event.js";

const port = Number(process.env.PORT ?? 3000);

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 12 * 1024 * 1024) throw new Error("Request body exceeds 12 MB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/shipment-events") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const event = shipmentEventSchema.parse(await readJson(request));
    send(response, 202, await processShipmentEvent(event));
  } catch (error) {
    if (error instanceof ZodError) {
      send(response, 400, { error: "Invalid shipment event", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => console.log(`POD intake listening on http://localhost:${port}`));
}
