const endpoint = process.env.SERVICE_URL ?? "http://localhost:3000/shipment-events";

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    eventId: crypto.randomUUID(),
    shipmentId: "SHP-2048",
    occurredAt: new Date().toISOString(),
    type: "delivered",
    proof: {
      filename: "doorstep.jpg",
      contentType: "image/jpeg",
      base64: process.env.POD_IMAGE_BASE64 ?? "",
    },
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
