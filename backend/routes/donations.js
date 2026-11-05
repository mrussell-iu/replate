
const express = require("express");
const repo = require("../repositories/donationRepository");

const router = express.Router();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const validId = (value) =>
  Number.isSafeInteger(value) && value > 0;

const nonblank = (value) =>
  typeof value === "string" && value.trim().length > 0;

// Convert HTML datetime-local to MySQL DATETIME.
// Example: 2026-11-10T14:30 -> 2026-11-10 14:30:00

function mysqlDateTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)
  ) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return value.replace("T", " ") +
    (value.length === 16 ? ":00" : "");
}

// ============================================================
// DONATION VALIDATION
// ============================================================

function validateDonation(data, partial = false) {
  const required = [
    "food_type",
    "quantity",
    "quantity_unit",
    "pickup_address",
    "pickup_date",
    "pickup_time",
    "claim_deadline"
  ];

  if (
    !partial &&
    required.some(
      key =>
        data[key] === undefined ||
        data[key] === null ||
        data[key] === ""
    )
  ) {
    return "Please complete all required donation fields.";
  }

  for (const key of [
    "food_type",
    "quantity_unit",
    "pickup_address"
  ]) {
    if (key in data && !nonblank(data[key])) {
      return `${key} cannot be empty.`;
    }
  }

  if ("quantity" in data) {
    const quantity = Number(data.quantity);

    if (
      data.quantity === "" ||
      data.quantity === null ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return "Quantity must be a positive number.";
    }
  }

  if ("pickup_date" in data) {
    if (
      typeof data.pickup_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.pickup_date)
    ) {
      return "Pickup date is invalid.";
    }

    const date = new Date(`${data.pickup_date}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return "Pickup date is invalid.";
    }
  }

  if ("pickup_time" in data) {
    if (
      typeof data.pickup_time !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
        data.pickup_time
      )
    ) {
      return "Pickup time is invalid.";
    }
  }

  if ("claim_deadline" in data) {
    const formatted = mysqlDateTime(data.claim_deadline);

    if (
      !formatted ||
      new Date(data.claim_deadline).getTime() <= Date.now()
    ) {
      return "Claim deadline must be in the future.";
    }
  }

  return null;
}

// ============================================================
// GET AVAILABLE DONATIONS
// GET /api/donations
// ============================================================

router.get("/", async (req, res) => {
  try {
    const donations = await repo.findAvailable();

    return res.status(200).json(donations);

  } catch (error) {
    console.error("GET donations failed:", error);

    return res.status(500).json({
      error: "Unable to retrieve donations."
    });
  }
});

// ============================================================
// POST DONATION
// POST /api/donations
// ============================================================

router.post("/", async (req, res) => {
  try {
    const data = req.body || {};

    const problem = validateDonation(data);

    if (problem) {
      return res.status(400).json({
        error: problem
      });
    }

    const result = await repo.insertDonation({
      food_type: data.food_type.trim(),
      quantity: Number(data.quantity),
      quantity_unit: data.quantity_unit.trim(),
      pickup_address: data.pickup_address.trim(),
      pickup_date: data.pickup_date,
      pickup_time: data.pickup_time,
      claim_deadline: mysqlDateTime(data.claim_deadline),
      additional_information:
        typeof data.additional_information === "string"
          ? data.additional_information.trim()
          : null
    });

    if (result.status === "MISSING_DONOR") {
      return res.status(409).json({
        error:
          "Demo donor organization missing. Run database/seed.sql."
      });
    }

    if (result.status !== "SUCCESS") {
      return res.status(500).json({
        error: "Unable to save donation."
      });
    }

    return res.status(201).json({
      message: "Donation posted successfully.",
      donation_id: result.donation_id
    });

  } catch (error) {
    console.error("POST donation failed:", error);

    return res.status(500).json({
      error: "Unable to save donation."
    });
  }
});

// ============================================================
// CLAIM DONATION
// POST /api/donations/:id/claim
// ============================================================

router.post("/:id/claim", async (req, res) => {
  const donationId = Number(req.params.id);
  const recipientUserId = Number(req.body?.recipient_user_id);

  if (!validId(donationId)) {
    return res.status(400).json({
      error: "Invalid donation ID."
    });
  }

  if (
    req.body?.recipient_user_id === undefined ||
    req.body?.recipient_user_id === null ||
    req.body?.recipient_user_id === "" ||
    !validId(recipientUserId)
  ) {
    return res.status(400).json({
      error: "A valid recipient user ID is required."
    });
  }

  try {
    const result = await repo.claimDonation(
      donationId,
      recipientUserId
    );

    if (result.status === "INVALID_RECIPIENT") {
      return res.status(400).json({
        error: "Recipient account not found."
      });
    }

    if (result.status === "NOT_FOUND") {
      return res.status(404).json({
        error: "Donation not found."
      });
    }

    if (result.status === "UNAVAILABLE") {
      return res.status(409).json({
        error: "This donation is already claimed or expired."
      });
    }

    if (result.status !== "SUCCESS") {
      return res.status(500).json({
        error: "Unable to claim donation."
      });
    }

    return res.status(200).json({
      message: "Donation claimed successfully.",
      donation_id: donationId,
      recipient_user_id: recipientUserId
    });

  } catch (error) {
    console.error("Claim donation failed:", error);

    return res.status(500).json({
      error: "Unable to claim donation."
    });
  }
});

// ============================================================
// EDIT DONATION
// PUT /api/donations/:id
// ============================================================

router.put("/:id", async (req, res) => {
  const donationId = Number(req.params.id);

  if (!validId(donationId)) {
    return res.status(400).json({
      error: "Invalid donation ID."
    });
  }

  const allowedFields = [
    "food_type",
    "quantity",
    "quantity_unit",
    "pickup_address",
    "pickup_date",
    "pickup_time",
    "claim_deadline",
    "additional_information"
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        field
      )
    ) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: "No valid fields provided."
    });
  }

  const problem = validateDonation(updates, true);

  if (problem) {
    return res.status(400).json({
      error: problem
    });
  }

  for (const field of [
    "food_type",
    "quantity_unit",
    "pickup_address"
  ]) {
    if (field in updates) {
      updates[field] = updates[field].trim();
    }
  }

  if ("quantity" in updates) {
    updates.quantity = Number(updates.quantity);
  }

  if ("claim_deadline" in updates) {
    updates.claim_deadline = mysqlDateTime(
      updates.claim_deadline
    );
  }

  try {
    const result = await repo.updateDonation(
      donationId,
      updates
    );

    if (result.status === "NO_FIELDS") {
      return res.status(400).json({
        error: "No valid fields provided."
      });
    }

    if (result.status === "NOT_FOUND_OR_UNAVAILABLE") {
      return res.status(404).json({
        error: "Donation not found or no longer available."
      });
    }

    if (result.status !== "SUCCESS") {
      return res.status(500).json({
        error: "Unable to update donation."
      });
    }

    return res.status(200).json({
      message: "Donation updated successfully."
    });

  } catch (error) {
    console.error("PUT donation failed:", error);

    return res.status(500).json({
      error: "Unable to update donation."
    });
  }
});

module.exports = router;
