const pool = require('../config/db');

async function findAvailable() {
  const [rows] = await pool.query(`
    SELECT d.donation_id, d.food_type, d.quantity, d.quantity_unit,
           d.pickup_address, d.pickup_date, d.pickup_time,
           d.claim_deadline, d.additional_information, d.status,
           o.organization_name
    FROM donations d JOIN organizations o ON o.organization_id=d.organization_id
    WHERE d.status='AVAILABLE' AND d.claim_deadline > NOW()
    ORDER BY d.created_at DESC, d.donation_id DESC
  `);
  return rows;
}

async function insertDonation(data) {
  const [orgs] = await pool.query(`
    SELECT organization_id FROM organizations
    WHERE organization_name='Replate Demo Restaurant'
      AND organization_type='FOODSERVICE' ORDER BY organization_id LIMIT 1
  `);
  if (!orgs.length) return { status: 'MISSING_DONOR' };
  const [result] = await pool.execute(`
    INSERT INTO donations (organization_id, recipient_user_id, food_type,
      quantity, quantity_unit, pickup_address, pickup_date, pickup_time,
      claim_deadline, additional_information, status)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')
  `, [orgs[0].organization_id, data.food_type, data.quantity,
      data.quantity_unit, data.pickup_address, data.pickup_date,
      data.pickup_time, data.claim_deadline, data.additional_information || null]);
  return { status: 'SUCCESS', donation_id: result.insertId };
}

async function claimDonation(donationId, recipientUserId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [recipients] = await conn.execute(`
      SELECT u.user_id FROM users u
      JOIN organizations o ON o.organization_id=u.organization_id
      WHERE u.user_id=? AND u.role='RECIPIENT'
        AND o.organization_type='RECIPIENT'
    `, [recipientUserId]);
    if (!recipients.length) {
      await conn.rollback();
      return { status: 'INVALID_RECIPIENT' };
    }
    // Atomic conditional update: only one concurrent claim can win.
    const [update] = await conn.execute(`
      UPDATE donations SET status='CLAIMED', recipient_user_id=?
      WHERE donation_id=? AND status='AVAILABLE' AND claim_deadline > NOW()
    `, [recipientUserId, donationId]);
    if (update.affectedRows !== 1) {
      await conn.rollback();
      return { status: 'UNAVAILABLE' };
    }
    await conn.execute(`
      INSERT INTO claims (donation_id, recipient_id, claim_status)
      VALUES (?, ?, 'CLAIMED')
    `, [donationId, recipientUserId]);
    await conn.commit();
    return { status: 'SUCCESS' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function updateDonation(donationId, updates) {
  const allowed = ['food_type','quantity','quantity_unit','pickup_address',
    'pickup_date','pickup_time','claim_deadline','additional_information'];
  const keys = allowed.filter(k => Object.prototype.hasOwnProperty.call(updates,k));
  if (!keys.length) return 0;
  const [result] = await pool.execute(`
    UPDATE donations SET ${keys.map(k => `${k}=?`).join(', ')}
    WHERE donation_id=? AND status='AVAILABLE'
  `, [...keys.map(k => updates[k]), donationId]);
  return result.affectedRows;
}

module.exports = { findAvailable, insertDonation, claimDonation, updateDonation };
