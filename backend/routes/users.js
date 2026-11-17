
const express = require("express");
const userRepository = require("../repositories/userRepository");

const router = express.Router();

function nonblank(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

// POST /api/users/register
router.post("/register", async (req, res) => {
  const data = req.body || {};

  const {
    organization_name,
    organization_type,
    address,
    email,
    password
  } = data;

  // Validate required fields.
  if (
    !nonblank(organization_name) ||
    !nonblank(organization_type) ||
    !nonblank(address) ||
    !nonblank(email) ||
    !nonblank(password)
  ) {
    return res.status(400).json({
      error: "All fields are required."
    });
  }

  // Validate organization type.
  if (
    organization_type !== "FOODSERVICE" &&
    organization_type !== "RECIPIENT"
  ) {
    return res.status(400).json({
      error:
        "Organization type must be either FOODSERVICE or RECIPIENT."
    });
  }

  // Basic email validation.
  const normalizedEmail = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({
      error: "Please enter a valid email address."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must contain at least 8 characters."
    });
  }

  try {
    const result = await userRepository.registerUser({
      organization_name: organization_name.trim(),
      organization_type,
      address: address.trim(),
      email: normalizedEmail,
      password
    });

    if (result.status === "DUPLICATE_EMAIL") {
      return res.status(400).json({
        error: "Email is already in use."
      });
    }

    return res.status(201).json({
      message: "User registered successfully.",
      user_id: result.user_id,
      organization_id: result.organization_id,
      role: result.role
    });

  } catch (error) {
    console.error("Registration Error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
});

module.exports = router;
