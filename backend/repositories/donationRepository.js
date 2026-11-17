
const pool = require("../config/db");

async function findAvailable() {
  const [rows] = await pool.query(`
    SELECT d.donation_id, d.organization_id,
      d.food_type, d.quantity, d.quantity_unit,
      d.pickup_address, d.pickup_date, d.pickup_time,
      d.claim_deadline, d.additional_information,
      d.status, o.organization_name
    FROM donations d
    JOIN organizations o
      ON o.organization_id = d.organization_id
    WHERE d.status = 'AVAILABLE'
      AND d.claim_deadline > NOW()
    ORDER BY d.created_at DESC, d.donation_id DESC
  `);
  return rows;
}

async function findDonorOrganization(organizationId) {
  const [rows] = await pool.execute(`
    SELECT organization_id FROM organizations
    WHERE organization_id = ?
      AND organization_type = 'FOODSERVICE'
    LIMIT 1
  `, [organizationId]);
  return rows[0] || null;
}

async function insertDonation(data, organizationId) {
  const donor = await findDonorOrganization(organizationId);
  if (!donor) return { status: "INVALID_DONOR" };

  const [result] = await pool.execute(`
    INSERT INTO donations (
      organization_id, recipient_user_id,
      food_type, quantity, quantity_unit,
      pickup_address, pickup_date, pickup_time,
      claim_deadline, additional_information, status
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')
  `, [
    organizationId, data.food_type, data.quantity,
    data.quantity_unit, data.pickup_address,
    data.pickup_date, data.pickup_time,
    data.claim_deadline,
    data.additional_information || null
  ]);

  return {
    status: "SUCCESS",
    donation_id: result.insertId,
    organization_id: organizationId
  };
}

async function claimDonation(donationId, recipientUserId) {
  const conn = await pool.getConnection();
  let active = false;

  try {
    await conn.beginTransaction();
    active = true;

    const [recipients] = await conn.execute(`
      SELECT u.user_id FROM users u
      JOIN organizations o
        ON o.organization_id = u.organization_id
      WHERE u.user_id = ?
        AND u.role = 'RECIPIENT'
        AND o.organization_type = 'RECIPIENT'
      LIMIT 1
    `, [recipientUserId]);

    if (!recipients.length) {
      await conn.rollback();
      active = false;
      return { status: "INVALID_RECIPIENT" };
    }

    // Conditional update prevents concurrent double claims.
    const [update] = await conn.execute(`
      UPDATE donations
      SET status = 'CLAIMED',
          recipient_user_id = ?
      WHERE donation_id = ?
        AND status = 'AVAILABLE'
        AND claim_deadline > NOW()
    `, [recipientUserId, donationId]);

    if (update.affectedRows !== 1) {
      await conn.rollback();
      active = false;
      return { status: "UNAVAILABLE" };
    }

    await conn.execute(`
      INSERT INTO claims (
        donation_id, recipient_id, claim_status
      ) VALUES (?, ?, 'CLAIMED')
    `, [donationId, recipientUserId]);

    await conn.commit();
    active = false;

    return {
      status: "SUCCESS",
      donation_id: donationId,
      recipient_user_id: recipientUserId
    };
  } catch (err) {
    if (active) {
      try { await conn.rollback(); }
      catch (e) { console.error("Claim rollback:", e); }
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function findDonationForEdit(id, organizationId) {
  const [rows] = await pool.execute(`
    SELECT donation_id, organization_id, food_type,
      quantity, quantity_unit, pickup_address,
      pickup_date, pickup_time, claim_deadline,
      additional_information, status
    FROM donations
    WHERE donation_id = ?
      AND organization_id = ?
      AND status = 'AVAILABLE'
      AND claim_deadline > NOW()
    LIMIT 1
  `, [id, organizationId]);

  return rows[0] || null;
}

async function updateDonation(id, updates, organizationId) {
  const allowed = [
    "food_type", "quantity", "quantity_unit",
    "pickup_address", "pickup_date", "pickup_time",
    "claim_deadline", "additional_information"
  ];

  const keys = allowed.filter(key =>
    Object.prototype.hasOwnProperty.call(updates, key)
  );

  if (!keys.length) return { status: "NO_FIELDS" };

  const assignments = keys.map(key => `${key} = ?`).join(", ");
  const values = keys.map(key => updates[key]);

  const [result] = await pool.execute(`
    UPDATE donations
    SET ${assignments}
    WHERE donation_id = ?
      AND organization_id = ?
      AND status = 'AVAILABLE'
      AND claim_deadline > NOW()
  `, [...values, id, organizationId]);

  return result.affectedRows === 1
    ? { status: "SUCCESS", donation_id: id }
    : { status: "NOT_FOUND_OR_FORBIDDEN" };
}

// ============================================================
// RECIPIENT CLAIMS AND PICKUP HISTORY
// ============================================================

async function findRecipientDonations(recipientUserId) {
  const [rows] = await pool.execute(`
    SELECT
      d.donation_id, d.organization_id,
      d.food_type, d.quantity, d.quantity_unit,
      d.pickup_address, d.pickup_date, d.pickup_time,
      d.status, d.pickup_confirmed_at,
      d.pickup_confirmed_by,
      c.claim_id, c.claim_status, c.claimed_at,
      o.organization_name
    FROM donations d
    JOIN claims c
      ON c.donation_id = d.donation_id
    JOIN organizations o
      ON o.organization_id = d.organization_id
    WHERE d.recipient_user_id = ?
      AND c.recipient_id = ?
      AND d.status IN ('CLAIMED', 'COMPLETED')
    ORDER BY c.claimed_at DESC, d.donation_id DESC
  `, [recipientUserId, recipientUserId]);

  return rows;
}

// ============================================================
// CONFIRM PICKUP — ATOMIC TRANSACTION
// ============================================================

async function confirmPickup(donationId, recipientUserId) {
  const conn = await pool.getConnection();
  let active = false;

  try {
    await conn.beginTransaction();
    active = true;

    // Lock donation to serialize competing confirmations.
    const [donations] = await conn.execute(`
      SELECT donation_id, status, recipient_user_id,
        pickup_confirmed_at
      FROM donations
      WHERE donation_id = ?
      FOR UPDATE
    `, [donationId]);

    if (!donations.length) {
      await conn.rollback();
      active = false;
      return { status: "NOT_FOUND" };
    }

    const donation = donations[0];

    // Only the recipient who claimed it may confirm pickup.
    if (Number(donation.recipient_user_id) !== recipientUserId) {
      await conn.rollback();
      active = false;
      return { status: "FORBIDDEN" };
    }

    if (donation.status !== "CLAIMED" ||
        donation.pickup_confirmed_at !== null) {
      await conn.rollback();
      active = false;
      return { status: "INVALID_STATE" };
    }

    // Lock and verify the matching claim record.
    const [claims] = await conn.execute(`
      SELECT claim_id, claim_status
      FROM claims
      WHERE donation_id = ? AND recipient_id = ?
      FOR UPDATE
    `, [donationId, recipientUserId]);

    if (claims.length !== 1 ||
        claims[0].claim_status !== "CLAIMED") {
      await conn.rollback();
      active = false;
      return { status: "INVALID_STATE" };
    }

    const [update] = await conn.execute(`
      UPDATE donations
      SET status = 'COMPLETED',
          pickup_confirmed_at = NOW(),
          pickup_confirmed_by = ?
      WHERE donation_id = ?
        AND recipient_user_id = ?
        AND status = 'CLAIMED'
        AND pickup_confirmed_at IS NULL
    `, [recipientUserId, donationId, recipientUserId]);

    if (update.affectedRows !== 1) {
      await conn.rollback();
      active = false;
      return { status: "INVALID_STATE" };
    }

    const [claimUpdate] = await conn.execute(`
      UPDATE claims
      SET claim_status = 'COMPLETED'
      WHERE claim_id = ?
        AND claim_status = 'CLAIMED'
    `, [claims[0].claim_id]);

    if (claimUpdate.affectedRows !== 1) {
      throw new Error("Claim state update failed.");
    }

    await conn.commit();
    active = false;

    return {
      status: "SUCCESS",
      donation_id: donationId,
      pickup_confirmed_by: recipientUserId
    };
  } catch (err) {
    if (active) {
      try { await conn.rollback(); }
      catch (e) { console.error("Pickup rollback:", e); }
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  findAvailable,
  findDonorOrganization,
  insertDonation,
  claimDonation,
  findDonationForEdit,
  updateDonation,
  findRecipientDonations,
  confirmPickup
};
