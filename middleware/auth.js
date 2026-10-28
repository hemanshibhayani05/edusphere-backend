const { verifyAccessToken } = require("../utils/jwt");
const BlacklistedToken = require("../models/BlacklistedToken");
const User = require("../models/User");

// Verify Access Token & Check Blacklist
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    } else if (req.headers["x-access-token"]) {
      token = req.headers["x-access-token"];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required. Format: Bearer <token>",
      });
    }

    // 1. Check if token is blacklisted in MongoDB
    const blacklisted = await BlacklistedToken.findOne({ token });
    if (blacklisted) {
      return res.status(401).json({
        success: false,
        code: "TOKEN_REVOKED",
        message: "Token has been revoked/blacklisted. Please log in again.",
      });
    }

    // 2. Verify token signature and expiration
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_EXPIRED",
          message: "Access token has expired (15m limit). Please refresh token.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid or malformed token.",
      });
    }

    // 3. Attach user from DB
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account associated with this token no longer exists.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "User account has been deactivated.",
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server authentication error.",
    });
  }
};

// Role-based Access Control Middleware
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Role "${req.user?.role}" is not authorized for this resource.`,
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
};
