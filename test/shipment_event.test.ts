import assert from "node:assert/strict";
import test from "node:test";
import { decideEvent, shipmentEventSchema } from "../src/shipment_event.js";

const baseEvent = {
  eventId: "30d93f1e-1b14-49a8-a672-558a48e587f0",
  shipmentId: "SHP-2048",
  occurredAt: "2026-09-24T09:30:00+08:00",
};

test("delivered shipment enters proof processing when POD is present", () => {
  const event = shipmentEventSchema.parse({
    ...baseEvent,
    type: "delivered",
    proof: { filename: "doorstep.jpg", contentType: "image/jpeg", base64: "cHJvb2YtaW1hZ2UtYnl0ZXM=" },
  });
  assert.deepEqual(decideEvent(event), { state: "proof_processing", needsImage: true });
});

test("delivered shipment without POD is rejected at the request boundary", () => {
  const result = shipmentEventSchema.safeParse({ ...baseEvent, type: "delivered" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0]?.path.join("."), "proof");
});

test("exception shipment becomes attention required without forcing an image", () => {
  const event = shipmentEventSchema.parse({
    ...baseEvent,
    type: "exception",
    exception: { code: "weather", note: "Access road closed by flooding" },
  });
  assert.deepEqual(decideEvent(event), { state: "attention_required", needsImage: false });
});
