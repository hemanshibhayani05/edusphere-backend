const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "edusphere_jwt_access_super_secret_key_2026_fallback";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "edusphere_jwt_refresh_super_secret_key_2026_fallback";

// Access Token: 15 minutes
const ACCESS_TOKEN_EXPIRY = "15m";
// Refresh Token: 7 days
const REFRESH_TOKEN_EXPIRY = "7d";

// Generate Access Token (15 mins)
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

// Generate Refresh Token (7 days)
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

// Verify Access Token
const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

// Verify Refresh Token
const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET);
};

// Standard Cookie Options for HTTP-only Refresh Token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_COOKIE_OPTIONS,
};
