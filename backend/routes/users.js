const express = require("express");
const pool = require("../config/db");
const bcrypt = require("bcrypt");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { organization_name, orgnization_type, address, name, email, password } = req.body;

  if (!organization_name || !organization_type || !address || !email || !password ) {
    return res.status(400).json({ error: "All field are required."});
  }

  if (organization_type !== "FOODSERVICE" && organization_type !== "RECIPIENT") {
    return res.status(400).json({ error: "Role must be either 'donor' or 'recipient'."});
  }

  const role = "FOOD_DONOR";

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    
    const [existingUser] = await connection.query(
      "SELECT email FROM users WHERE email = ?",
      [email]
      );

    if (existingUser.length > 0) {
      connection.release();
      return res.status(400).json({ error: "Email is already in use."});
    }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const insertQuery =
    INSERT INTO users (organization_name, organization_type, address, name, email, password) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ;

  await connection.query(insertQuery, [
    organization_name,
    organization_type,
    address,
    name,
    email,
    hashedPassword
    ]);

   await connection.commit();
   connection.release();
  } catch (error) {
  console.error("Registration Error:", error);
  return res.status(500).json({ error:"Internal server error."});
}
    });

module.exports = router;
    
                                
                                
