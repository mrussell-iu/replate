const express = require("express");
const pool = require("../config/db");
const bcrypt = require("bcrypt");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "All field are required."});
  }

  if (role !== "donor" && role !== "recipient") {
    return res.status(400).json({ error: "Role must be either 'donor' or 'recipient'."});
  }

  try {
    const [existingUser] = await pool.query(
      "SELECT email FROM users WHERE email = ?",
      [email]
      );

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const [result] = await pool.query(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
    [name, email, hashedPassword, role]
    );

    res.status(201).json({
      message: "Account created successfully!",
      userId: result.insertId,
      role: role
    });
  } catch (error) {
    console.error(error) {
    res.status(500).json({ error: "Unable to create an account."});
    }
  });

module.exports = router;
    
                                
                                
