
const pool = require("../config/db");
const bcrypt = require("bcrypt");

/**
 * Register a new organization and its first user.
 *
 * All database writes occur inside one transaction.
 * If registration fails, neither record is saved.
 */
async function registerUser(data) {
  const {
    organization_name,
    organization_type,
    address,
    email,
    password
  } = data;

  const role =
    organization_type === "FOODSERVICE"
      ? "FOOD_DONOR"
      : "RECIPIENT";

  // Hash the password before opening a transaction.
  const passwordHash = await bcrypt.hash(password, 10);

  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    // Check whether this email is already registered.
    const [existingUsers] = await connection.execute(
      `SELECT user_id
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      transactionStarted = false;

      return {
        status: "DUPLICATE_EMAIL"
      };
    }

    // Create the organization.
    const [organizationResult] = await connection.execute(
      `INSERT INTO organizations
         (organization_name, organization_type, address)
       VALUES (?, ?, ?)`,
      [
        organization_name,
        organization_type,
        address
      ]
    );

    const organizationId = organizationResult.insertId;

    // Create the user and associate it with the organization.
    const [userResult] = await connection.execute(
      `INSERT INTO users
         (organization_id, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [
        organizationId,
        email,
        passwordHash,
        role
      ]
    );

    await connection.commit();
    transactionStarted = false;

    return {
      status: "SUCCESS",
      user_id: userResult.insertId,
      organization_id: organizationId,
      role
    };

  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    // Protect against concurrent duplicate registrations.
    if (error.code === "ER_DUP_ENTRY") {
      return {
        status: "DUPLICATE_EMAIL"
      };
    }

    throw error;

  } finally {
    connection.release();
  }
}

module.exports = {
  registerUser
};
