
const express = require("express");
const repo = require("../repositories/donationRepository");
const {
  requireAuth,
  requireRole
} = require("../middleware/auth");

const router = express.Router();

const validId = id =>
  Number.isSafeInteger(id) && id > 0;

const nonblank = value =>
  typeof value === "string" && value.trim().length > 0;

function parseLocalDateTime(value) {
  if (typeof value !== "string") return null;

  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;

  const date = match[1];
  const time = `${match[2]}:${match[3] || "00"}`;
  const parsed = new Date(`${date}T${time}`);

  if (Number.isNaN(parsed.getTime())) return null;

  const pad = n => String(n).padStart(2, "0");
  const actualDate = [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate())
  ].join("-");
  const actualTime = [
    pad(parsed.getHours()),
    pad(parsed.getMinutes()),
    pad(parsed.getSeconds())
  ].join(":");

  if (actualDate !== date || actualTime !== time) return null;

  return {
    timestamp: parsed.getTime(),
    mysql: `${date} ${time}`
  };
}

function validateDonation(data, partial = false) {
  const required = [
    "food_type", "quantity", "quantity_unit",
    "pickup_address", "pickup_date", "pickup_time",
    "claim_deadline"
  ];

  if (!partial && required.some(k =>
    data[k] === undefined || data[k] === null || data[k] === ""
  )) return "Please complete all required donation fields.";

  for (const key of [
    "food_type", "quantity_unit", "pickup_address"
  ]) {
    if (key in data && !nonblank(data[key]))
      return `${key} cannot be empty.`;
  }

  if ("quantity" in data &&
      (data.quantity === "" || data.quantity === null ||
       !Number.isFinite(Number(data.quantity)) ||
       Number(data.quantity) <= 0 ||
       Number(data.quantity) > 99999999.99)) {
    return "Quantity must be a positive number.";
  }

  if ("pickup_date" in data &&
      (typeof data.pickup_date !== "string" ||
       !/^\d{4}-\d{2}-\d{2}$/.test(data.pickup_date))) {
    return "Pickup date is invalid.";
  }

  if ("pickup_time" in data &&
      (typeof data.pickup_time !== "string" ||
       !/^\d{2}:\d{2}(?::\d{2})?$/.test(data.pickup_time))) {
    return "Pickup time is invalid.";
  }

  if ("claim_deadline" in data) {
    const deadline = parseLocalDateTime(data.claim_deadline);
    if (!deadline || deadline.timestamp <= Date.now())
      return "Claim deadline must be in the future.";
  }

  if ("additional_information" in data &&
      data.additional_information !== null &&
      typeof data.additional_information !== "string") {
    return "Additional information must be text.";
  }

  return null;
}

function validateSchedule(data) {
  const pickup = parseLocalDateTime(
    `${data.pickup_date}T${data.pickup_time}`
  );
  const deadline = parseLocalDateTime(data.claim_deadline);

  if (!pickup || !deadline)
    return "Pickup schedule is invalid.";

  if (pickup.timestamp <= Date.now())
    return "Pickup date and time must be in the future.";

  if (deadline.timestamp <= Date.now())
    return "Claim deadline must be in the future.";

  if (deadline.timestamp >= pickup.timestamp)
    return "Claim deadline must be before pickup.";

  return null;
}

function normalize(data) {
  const result = { ...data };

  for (const key of [
    "food_type", "quantity_unit", "pickup_address"
  ]) {
    if (key in result) result[key] = result[key].trim();
  }

  if ("quantity" in result)
    result.quantity = Number(result.quantity);

  if ("claim_deadline" in result)
    result.claim_deadline =
      parseLocalDateTime(result.claim_deadline).mysql;

  return result;
}

function errorResponse(res, error, label, message) {
  console.error(label, error);
  return res.status(500).json({ error: message });
}

// ============================================================
// AVAILABLE DONATIONS — AUTHENTICATED USERS
// ============================================================

router.get("/", requireAuth, async (req, res) => {
  try {
    return res.json(await repo.findAvailable());
  } catch (err) {
    return errorResponse(
      res, err, "List donations:",
      "Unable to retrieve donations."
    );
  }
});

// ============================================================
// RECIPIENT CLAIMS AND PICKUP HISTORY
// Important: place before routes using /:id.
// ============================================================

router.get(
  "/my-claims",
  requireRole("RECIPIENT"),
  async (req, res) => {
    try {
      const rows = await repo.findRecipientDonations(
        Number(req.session.user.user_id)
      );
      return res.json(rows);
    } catch (err) {
      return errorResponse(
        res, err, "Recipient history:",
        "Unable to retrieve claimed donations."
      );
    }
  }
);

// ============================================================
// POST DONATION — FOOD DONOR ONLY
// ============================================================

router.post(
  "/",
  requireRole("FOOD_DONOR"),
  async (req, res) => {
    const data = req.body || {};
    const problem = validateDonation(data);

    if (problem)
      return res.status(400).json({ error: problem });

    const scheduleProblem = validateSchedule(data);
    if (scheduleProblem)
      return res.status(400).json({ error: scheduleProblem });

    try {
      const result = await repo.insertDonation(
        normalize({
          food_type: data.food_type,
          quantity: data.quantity,
          quantity_unit: data.quantity_unit,
          pickup_address: data.pickup_address,
          pickup_date: data.pickup_date,
          pickup_time: data.pickup_time,
          claim_deadline: data.claim_deadline,
          additional_information:
            data.additional_information || null
        }),
        Number(req.session.user.organization_id)
      );

      if (result.status !== "SUCCESS")
        return res.status(403).json({
          error: "Invalid donor organization."
        });

      return res.status(201).json({
        message: "Donation posted successfully.",
        donation_id: result.donation_id,
        organization_id: result.organization_id
      });
    } catch (err) {
      return errorResponse(
        res, err, "Post donation:",
        "Unable to save donation."
      );
    }
  }
);

// ============================================================
// CLAIM — AUTHENTICATED RECIPIENT ONLY
// ============================================================

router.post(
  "/:id/claim",
  requireRole("RECIPIENT"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!validId(id))
      return res.status(400).json({
        error: "Invalid donation ID."
      });

    try {
      const result = await repo.claimDonation(
        id, Number(req.session.user.user_id)
      );

      if (result.status === "INVALID_RECIPIENT")
        return res.status(403).json({
          error: "Invalid recipient account."
        });

      if (result.status === "UNAVAILABLE")
        return res.status(409).json({
          error: "This donation is already claimed or expired."
        });

      return res.json({
        message: "Donation claimed successfully.",
        donation_id: id,
        recipient_user_id: result.recipient_user_id
      });
    } catch (err) {
      return errorResponse(
        res, err, "Claim donation:",
        "Unable to claim donation."
      );
    }
  }
);

// ============================================================
// CONFIRM PICKUP — CLAIMING RECIPIENT ONLY
// ============================================================

router.post(
  "/:id/confirm-pickup",
  requireRole("RECIPIENT"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!validId(id))
      return res.status(400).json({
        error: "Invalid donation ID."
      });

    try {
      const result = await repo.confirmPickup(
        id, Number(req.session.user.user_id)
      );

      if (result.status === "NOT_FOUND")
        return res.status(404).json({
          error: "Donation not found."
        });

      if (result.status === "FORBIDDEN")
        return res.status(403).json({
          error: "You cannot confirm another recipient's pickup."
        });

      if (result.status === "INVALID_STATE")
        return res.status(409).json({
          error: "Pickup cannot be confirmed for this donation."
        });

      return res.json({
        message: "Pickup confirmed successfully.",
        donation_id: id,
        status: "COMPLETED",
        pickup_confirmed_by: result.pickup_confirmed_by
      });
    } catch (err) {
      return errorResponse(
        res, err, "Confirm pickup:",
        "Unable to confirm pickup."
      );
    }
  }
);

// ============================================================
// EDIT — DONATION OWNER ONLY
// ============================================================

router.put(
  "/:id",
  requireRole("FOOD_DONOR"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!validId(id))
      return res.status(400).json({
        error: "Invalid donation ID."
      });

    const allowed = [
      "food_type", "quantity", "quantity_unit",
      "pickup_address", "pickup_date", "pickup_time",
      "claim_deadline", "additional_information"
    ];

    const updates = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(
        req.body || {}, key
      )) updates[key] = req.body[key];
    }

    if (!Object.keys(updates).length)
      return res.status(400).json({
        error: "No valid fields provided."
      });

    const problem = validateDonation(updates, true);
    if (problem)
      return res.status(400).json({ error: problem });

    const organizationId =
      Number(req.session.user.organization_id);

    try {
      const existing = await repo.findDonationForEdit(
        id, organizationId
      );

      if (!existing)
        return res.status(404).json({
          error: "Donation not found or you are not authorized to edit it."
        });

      // Requires dateStrings: true in MySQL pool configuration.
      const combined = {
        ...existing,
        ...updates,
        pickup_date:
          updates.pickup_date ?? existing.pickup_date,
        pickup_time:
          updates.pickup_time ?? existing.pickup_time,
        claim_deadline:
          updates.claim_deadline ?? existing.claim_deadline
      };

      const scheduleProblem = validateSchedule(combined);
      if (scheduleProblem)
        return res.status(400).json({
          error: scheduleProblem
        });

      const result = await repo.updateDonation(
        id, normalize(updates), organizationId
      );

      if (result.status !== "SUCCESS")
        return res.status(404).json({
          error: "Donation not found or no longer editable."
        });

      return res.json({
        message: "Donation updated successfully.",
        donation_id: id
      });
    } catch (err) {
      return errorResponse(
        res, err, "Edit donation:",
        "Unable to update donation."
      );
    }
  }
);

module.exports = router;
