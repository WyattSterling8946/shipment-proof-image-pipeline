import { z } from "zod";

const proofFile = z.object({
  filename: z.string().min(1).max(160),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(16),
});

export const shipmentEventSchema = z
  .object({
    eventId: z.string().uuid(),
    shipmentId: z.string().min(3).max(80),
    occurredAt: z.string().datetime({ offset: true }),
    type: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
    proof: proofFile.optional(),
    exception: z
      .object({
        code: z.enum(["address_issue", "damaged", "recipient_unavailable", "weather"]),
        note: z.string().min(3).max(500),
      })
      .optional(),
  })
  .superRefine((event, context) => {
    if (event.type === "delivered" && !event.proof) {
      context.addIssue({ code: "custom", path: ["proof"], message: "Delivered events require proof" });
    }
    if (event.type === "exception" && !event.exception) {
      context.addIssue({ code: "custom", path: ["exception"], message: "Exception events require details" });
    }
  });

export type ShipmentEvent = z.infer<typeof shipmentEventSchema>;

export type EventDecision =
  | { state: "recorded"; needsImage: false }
  | { state: "proof_processing"; needsImage: true }
  | { state: "attention_required"; needsImage: boolean };

export function decideEvent(event: ShipmentEvent): EventDecision {
  if (event.type === "exception") {
    return { state: "attention_required", needsImage: Boolean(event.proof) };
  }
  if (event.type === "delivered") return { state: "proof_processing", needsImage: true };
  return { state: "recorded", needsImage: false };
}
