
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

require("dotenv").config();

const donationRoutes = require("./routes/donations");
const userRoutes = require("./routes/users");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32
) {
  throw new Error(
    "SESSION_SECRET must contain at least 32 characters."
  );
}

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "replate",
  createDatabaseTable: true
});

app.disable("x-powered-by");

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json({ limit: "100kb" }));

app.use(session({
  name: "replate.sid",
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 2
  }
}));

app.use("/api/users", userRoutes);
app.use("/api/donations", donationRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Replate backend is running."
  });
});

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found."
  });
});

app.listen(PORT, () => {
  console.log(
    `Replate backend running on http://localhost:${PORT}`
  );
});
