
const bcrypt = require("bcrypt");
const express = require("express");
const userRepository = require("../repositories/userRepository");

const router = express.Router();

function nonblank(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}


const loginAttempts = new Map();

router.post("/login", async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const password = req.body?.password;

  if (!email || typeof password !== "string" || !password) {
    return res.status(400).json({
      error: "Email and password are required."
    });
  }

  try {
    const user = await userRepository.findUserByEmail(email);

    const validPassword = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !validPassword) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    // Regenerate the session to prevent session fixation.
    req.session.regenerate(error => {
      if (error) {
        console.error("Session regeneration failed:", error);
        return res.status(500).json({
          error: "Unable to start login session."
        });
      }

      req.session.user = {
        user_id: user.user_id,
        organization_id: user.organization_id,
        email: user.email,
        role: user.role,
        organization_name: user.organization_name
      };

      req.session.save(error => {
        if (error) {
          console.error("Session save failed:", error);
          return res.status(500).json({
            error: "Unable to save login session."
          });
        }

        return res.json({
          message: "Login successful.",
          user: req.session.user
        });
      });
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      error: "Unable to log in."
    });
  }
});

router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({
      error: "Not logged in."
    });
  }

  return res.json({
    user: req.session.user
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(error => {
    if (error) {
      console.error("Logout error:", error);
      return res.status(500).json({
        error: "Unable to log out."
      });
    }

    res.clearCookie("replate.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });

    return res.json({
      message: "Logged out successfully."
    });
  });
});


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
