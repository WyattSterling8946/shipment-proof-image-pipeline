import { infrai } from "./infrai.js";
import { decideEvent, type ShipmentEvent } from "./shipment_event.js";

const archiveBucket = process.env.INFRAI_BUCKET ?? "logistics-proof-archive";
let bucketPreparation: Promise<unknown> | undefined;

export function prepareArchive(): Promise<unknown> {
  bucketPreparation ??= infrai.storage.bucket.create({
    name: archiveBucket,
    idempotency_key: `bucket:${archiveBucket}`,
  });
  return bucketPreparation;
}

export async function processShipmentEvent(event: ShipmentEvent) {
  const decision = decideEvent(event);
  if (!decision.needsImage || !event.proof) {
    return { eventId: event.eventId, shipmentId: event.shipmentId, ...decision };
  }

  await prepareArchive();
  const archiveKey = `${event.shipmentId}/${event.eventId}/${event.proof.filename}`;
  await infrai.storage.object.put(archiveBucket, archiveKey, {
    data_base64: event.proof.base64,
    content_type: event.proof.contentType,
    idempotency_key: `${event.eventId}:archive`,
  });
  const variant = await infrai.image.resize({
    image: { base64: event.proof.base64 },
    width: 1600,
    height: 1600,
    fit: "inside",
    enlarge: false,
    format: "webp",
    store: true,
    idempotency_key: `${event.eventId}:pod-webp`,
  });

  return {
    eventId: event.eventId,
    shipmentId: event.shipmentId,
    ...decision,
    proof: { archiveKey, storedVariant: variant },
  };
}
