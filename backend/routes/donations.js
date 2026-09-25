const express = require("express");
const pool = require("../config/db");

const router = express.Router();

//Retrieve Donation Listings 
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

//Create Donation Entry 
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

//Update Existing Donation Listing 
router.put('/:id', async (req, es) => {
  const { id } = req.params;
  const {
        food_type,
        quantity,
        quantity_unit,
        pickup_address,
        pickup_date,
        pickup_time,
        claim_deadline,
        additional_information,
        status
  } + req.body;

  try { 
    const query =
      UPDATE donations
      SET 
        food_type = ?,
        quantity = ?,
        quantity_unit = ?,
        pickup_address = ?,
        pickup_date = ?,
        pickup_time = ?,
        claim_deadline = ?,
        additional_information = ?,
        status = ?
    WHERE id = ?
  ;
    const [result] = await pool.query(query, [
       food_type,
        quantity,
        quantity_unit,
        pickup_address,
        pickup_date,
        pickup_time,
        claim_deadline,
        additional_information || null,
        status,
        id
      ]);
    if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Donation listing not found.' });
          }
    res.json({ message: 'Donation listing updated successfully.' });
  } catch (error) {
    console.error('Error updating donation:', error);
          res.status(500).json({error: 'Database server error. '});
          }
          });

//Delete Existing Donation Listing 
router.delete('/:id', async (req, res) => {
          const { id } = req.params;

  try {
    const query = 'DELETE FROM donations WHERE id = ?';
    const [result] = await pool.query(query, [id]);

    if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Donation listing not found.' });
    }
    res.json({message: 'Donation listing deleted successfully.' });
      } catch (error) {
          console.error('Error deleting donation:', error);
          res.status(500).json({error: 'Database server error.' });
}
});
          
      
          
module.exports = router;
