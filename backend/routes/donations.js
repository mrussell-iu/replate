const express = require("express");
const pool = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        donation_id,
        food_type,
        quantity,
        quantity_unit,
        pickup_address,
        pickup_date,
        pickup_time,
        claim_deadline,
        additional_information,
        status
      FROM donations
      ORDER BY created_at DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to retrieve donations."
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      food_type,
      quantity,
      quantity_unit,
      pickup_address,
      pickup_date,
      pickup_time,
      claim_deadline,
      additional_information
    } = req.body;

    if (
      !food_type ||
      !quantity ||
      !quantity_unit ||
      !pickup_address ||
      !pickup_date ||
      !pickup_time ||
      !claim_deadline
    ) {
      return res.status(400).json({
        error: "Please complete all required donation fields."
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO donations
      (
        organization_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE')
      `,
      [
        1,
        food_type,
        quantity,
        quantity_unit,
        pickup_address,
        pickup_date,
        pickup_time,
        claim_deadline,
        additional_information || null
      ]
    );

    res.status(201).json({
      message: "Donation posted successfully.",
      donation_id: result.insertId
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to save donation."
    });
  }
});

module.exports = router;