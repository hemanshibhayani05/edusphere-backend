const path = require("path");

// Load .env from the backend folder
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

// ── Routes ──────────────────────────────────────────────────────────────────
const emailRoutes   = require("./routes/email");
const authRoutes    = require("./routes/auth");
const courseRoutes  = require("./routes/courses");
const paymentRoutes = require("./routes/payments");
const qnaRoutes     = require("./routes/qna");

// ── App setup ───────────────────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin: ["http://localhost:5000", "http://127.0.0.1:5000"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ── Mount routes ─────────────────────────────────────────────────────────────
app.use("/api/email",    emailRoutes);
app.use("/api/auth",     authRoutes);
app.use("/api/courses",  courseRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reports",  paymentRoutes);
app.use("/api/qna",      qnaRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "✅ EduSphere Backend is Running!",
    db: "MongoDB Atlas",
    routes: ["/api/auth", "/api/courses", "/api/email", "/api/payments", "/api/reports", "/api/qna"],
  });
});

// ── Start (connect DB first, then listen) ────────────────────────────────────
const PORT = process.env.BACKEND_PORT || 5001;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 EduSphere backend running on http://localhost:${PORT}`);
    console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  });
});