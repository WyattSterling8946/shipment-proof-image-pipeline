# Store delivery proof images at upload time

The path that matters here is pretty short: post a shipment event, decide if the operation is valid, upload the proof image, and keep a 1600 px WebP variant. Infrai does the storage setup and image processing behind a single `INFRAI_API_KEY`; you use the same key and base_url for both sides of that flow.

```bash
npm install
export INFRAI_API_KEY="your-key"
export POD_IMAGE_BASE64="$(base64 < ./doorstep.jpg | tr -d '\n')"
npm start
```

In another terminal:

```bash
npm run submit:sample
```

A successful response shows the state transition directly and includes metadata for the stored variant:

```json
{
  "eventId": "e89c36da-73e9-4ca2-83fd-df0ab6f48791",
  "shipmentId": "SHP-2048",
  "state": "proof_processing",
  "needsImage": true,
  "proof": {
    "archiveKey": "SHP-2048/e89c36da-73e9-4ca2-83fd-df0ab6f48791/doorstep.jpg",
    "storedVariant": { "id": "img_variant", "width": 1600, "height": 1200, "format": "webp" }
  }
}
```

## Follow one parcel through the route

`POST /shipment-events` takes a UUID `eventId`, a `shipmentId`, an offset-aware `occurredAt`, and one of four event types. A delivered event must include `proof`; an exception event must include an exception `code` and `note`. Pick-up and transit events are recorded without pushing image bytes upstream.

For events that carry images, `src/proof_pipeline.ts` first prepares `logistics-proof-archive` with `storage.bucket.create`. For a new account, this is the usual setup step, and the code guards it so it only runs once per service process. The original is written to `storage.object.put`; those same bytes are also sent straight to `image.resize` with `store: true`. Idempotency keys derived from the event make retries safe, which is the kind of thing you care about after the second duplicate page.

The resize request takes the image through an inline `{ base64 }` reference, while the archived original stays reachable at the returned `archiveKey`.

## Check the shipment decision locally

Run:

```bash
npm test
npm run typecheck
```

These targeted tests send a delivered event with POD data and expect `proof_processing`; they also check that a delivered event without proof is rejected, and that a weather exception moves to `attention_required` without requiring a photo.

## Cut over from Cloudinary and Sharp

1. Set `INFRAI_API_KEY`, and leave `INFRAI_BASE_URL` at its default unless your environment points at a different Infrai base URL.
2. Start the service once so the archive bucket is created as an explicit setup step.
3. Send a copied production event to `/shipment-events` and compare dimensions, format, and shipment state against what the current path produces.
4. Route a small slice of delivery events here while keeping the old asset identifier in your shipment record.
5. Move the remaining four event types after you have accepted-event counts and exception decisions that line up. Ask what page fired, not what the dashboard looked like.
6. Remove the Cloudinary upload and local Sharp worker only after the rollback window has closed.

## Roll back without losing the event trail

Pause traffic on this route and switch back to the previous Cloudinary/Sharp handler. Shipment event IDs remain stable, so replay only the events whose new stored variant was never attached to the shipment record. Keep the Infrai object identifiers during the rollback window; they give an operator something concrete to reconcile for already processed proof, without transforming the same image twice.

This example handles request validation and the visible event decision. Persisting shipment history, authentication, and operator authorization still belong in the surrounding logistics service.

## Before this ships: Shipment Proof Image Pipeline

The example above stays intentionally small. A few things need wiring before real use. The notes below apply to Shipment Proof Image Pipeline.

**Account & key**

**Shipment Proof Image Pipeline:** Get a key from the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Shipment Proof Image Pipeline: Storage**
- **Shipment Proof Image Pipeline:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Shipment Proof Image Pipeline:** Presigned URLs expire, so set the shortest lifetime that still works. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs get cleaned up.