
const pool = require("../config/db");

// ============================================================
// GET AVAILABLE DONATIONS
// ============================================================

async function findAvailable() {
  const [rows] = await pool.query(`
    SELECT
      d.donation_id,
      d.organization_id,
      d.food_type,
      d.quantity,
      d.quantity_unit,
      d.pickup_address,
      d.pickup_date,
      d.pickup_time,
      d.claim_deadline,
      d.additional_information,
      d.status,
      o.organization_name
    FROM donations d
    JOIN organizations o
      ON d.organization_id = o.organization_id
    WHERE d.status = 'AVAILABLE'
      AND d.claim_deadline > NOW()
    ORDER BY d.created_at DESC, d.donation_id DESC
  `);

  return rows;
}

// ============================================================
// CREATE DONATION
// ============================================================

async function insertDonation(data) {
  // Find the demo donor organization.
  // This avoids assuming the organization ID is always 1.

  const [organizations] = await pool.execute(
    `SELECT organization_id
     FROM organizations
     WHERE organization_name = ?
       AND organization_type = 'FOODSERVICE'
     ORDER BY organization_id
     LIMIT 1`,
    ["Replate Demo Restaurant"]
  );

  if (organizations.length === 0) {
    return {
      status: "MISSING_DONOR"
    };
  }

  const organizationId = organizations[0].organization_id;

  const [result] = await pool.execute(
    `INSERT INTO donations (
      organization_id,
      recipient_user_id,
      food_type,
      quantity,
      quantity_unit,
      pickup_address,
      pickup_date,
      pickup_time,
      claim_deadline,
      additional_information,
      status
    )
    VALUES (
      ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE'
    )`,
    [
      organizationId,
      data.food_type,
      data.quantity,
      data.quantity_unit,
      data.pickup_address,
      data.pickup_date,
      data.pickup_time,
      data.claim_deadline,
      data.additional_information || null
    ]
  );

  return {
    status: "SUCCESS",
    donation_id: result.insertId
  };
}

// ============================================================
// CLAIM DONATION
// ============================================================

async function claimDonation(donationId, recipientUserId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verify the recipient account exists.

    const [recipients] = await connection.execute(
      `SELECT
         u.user_id
       FROM users u
       JOIN organizations o
         ON u.organization_id = o.organization_id
       WHERE u.user_id = ?
         AND u.role = 'RECIPIENT'
         AND o.organization_type = 'RECIPIENT'`,
      [recipientUserId]
    );

    if (recipients.length === 0) {
      await connection.rollback();

      return {
        status: "INVALID_RECIPIENT"
      };
    }

    // Atomically claim the donation.
    // Only AVAILABLE donations with future deadlines qualify.

    const [updateResult] = await connection.execute(
      `UPDATE donations
       SET
         status = 'CLAIMED',
         recipient_user_id = ?
       WHERE donation_id = ?
         AND status = 'AVAILABLE'
         AND claim_deadline > NOW()`,
      [recipientUserId, donationId]
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      // Distinguish a missing donation from one that
      // is already claimed or has expired.

      const [donations] = await connection.execute(
        `SELECT donation_id
         FROM donations
         WHERE donation_id = ?`,
        [donationId]
      );

      return {
        status: donations.length === 0
          ? "NOT_FOUND"
          : "UNAVAILABLE"
      };
    }

    // Save the claim record in the same transaction.

    await connection.execute(
      `INSERT INTO claims (
         donation_id,
         recipient_id,
         claim_status
       )
       VALUES (?, ?, 'CLAIMED')`,
      [donationId, recipientUserId]
    );

    await connection.commit();

    return {
      status: "SUCCESS",
      donation_id: donationId,
      recipient_user_id: recipientUserId
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}

// ============================================================
// UPDATE DONATION
// ============================================================

async function updateDonation(donationId, updates) {
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

  const fields = allowedFields.filter(field =>
    Object.prototype.hasOwnProperty.call(updates, field)
  );

  if (fields.length === 0) {
    return {
      status: "NO_FIELDS"
    };
  }

  const assignments = fields
    .map(field => `${field} = ?`)
    .join(", ");

  const values = fields.map(field => updates[field]);

  const [result] = await pool.execute(
    `UPDATE donations
     SET ${assignments}
     WHERE donation_id = ?
       AND status = 'AVAILABLE'`,
    [...values, donationId]
  );

  if (result.affectedRows === 0) {
    return {
      status: "NOT_FOUND_OR_UNAVAILABLE"
    };
  }

  return {
    status: "SUCCESS"
  };
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================

module.exports = {
  findAvailable,
  insertDonation,
  claimDonation,
  updateDonation
};
