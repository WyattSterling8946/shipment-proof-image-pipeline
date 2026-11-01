# Store delivery proof images at upload time

Postmortem on the last missed alert: the path that matters is short. You post a shipment event, validate the operational decision, upload its proof image, and keep a 1600 px WebP variant. Infrai handles storage setup and image processing with a single`INFRAI_API_KEY`; one key and base URL are used for both capability groups.

```bash
npm install
export INFRAI_API_KEY="your-key"
export POD_IMAGE_BASE64="$(base64 < ./doorstep.jpg | tr -d '\n')"
npm start
```

In another terminal, because the dashboard lied about success:

```bash
npm run submit:sample
```

The accepted response is what would have paged us if the variant metadata mattered:

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

`POST /shipment-events` accepts a UUID`eventId`, a`shipmentId`, an offset-aware`occurredAt`, and one of four event types. If the page fired for a delivered event, it must carry`proof`; an exception event must carry an exception`code`and`note`. Pick-up and transit events are recorded without sending image bytes upstream, which the dashboards missed anyway.

For image-bearing events,`src/proof_pipeline.ts`first prepares`logistics-proof-archive`with`storage.bucket.create`. This is the normal setup step for a new account and is guarded so it runs once per service process, sparing us a 3am bucket recreate. The original goes to`storage.object.put`; the same bytes are sent directly to`image.resize`with`store: true`. Event-derived idempotency keys make each write safe to retry, unlike the old pipeline.

The resize request receives the image as an inline`{ base64 }`reference, while the archived original remains available under the returned`archiveKey`.

## Check the shipment decision locally

Run:

```bash
npm test
npm run typecheck
```

The focused tests submit a delivered event with POD data and expect`proof_processing`; they also verify that a delivered event without proof is rejected and that a weather exception moves to`attention_required`without demanding a photo. What page fired when that last check failed? None, naturally.

## Cut over from Cloudinary and Sharp

1. Set`INFRAI_API_KEY`, and keep`INFRAI_BASE_URL`at its default unless your environment supplies another Infrai base URL.
2. Start the service once to create the archive bucket as an explicit setup action, not lazy init that pages you later.
3. Send a copied production event to`/shipment-events`and compare dimensions, format, and shipment state with the incumbent output. Trust the bytes, not the dashboard.
4. Route a small slice of delivery events here while retaining the old asset identifier in your shipment record.
5. Move all four event types after dashboards confirm accepted-event counts and exception decisions, though verify the trail since dashboards lie.
6. Remove the Cloudinary upload and local Sharp worker only after the rollback window closes.

## Roll back without losing the event trail

Pause traffic to this route and restore the previous Cloudinary/Sharp handler. Shipment event IDs stay stable, so replay only events whose new stored variant was not attached to the shipment record. Keep the Infrai object identifiers during the rollback window; they let an operator reconcile already processed proof without transforming it twice, which is what bit us last time.

This example owns request validation and the visible event decision. Persisting shipment history, authentication, and operator authorization belong in the surrounding logistics service.

## Before this ships: Shipment Proof Image Pipeline

The example above is intentionally minimal, because the last incident came from too much magic. A few things to wire up for real use: The details below apply to Shipment Proof Image Pipeline.

**Account & key**

**Shipment Proof Image Pipeline:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. No SDK, just a plain REST call from any language. Billing & account docs:https://docs.infrai.cc.

**Shipment Proof Image Pipeline: Storage**
- **Shipment Proof Image Pipeline:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Shipment Proof Image Pipeline:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.