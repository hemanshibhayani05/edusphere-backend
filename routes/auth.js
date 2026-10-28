const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const BlacklistedToken = require("../models/BlacklistedToken");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  REFRESH_COOKIE_OPTIONS,
} = require("../utils/jwt");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const ALLOWED_ROLES = ["student", "admin", "instructor"];

/**
 * Helper to blacklist a token in MongoDB with TTL auto-cleanup
 */
async function blacklistToken(tokenString, type = "access", userId = null, reason = "logout") {
  if (!tokenString) return null;
  try {
    const decoded = jwt.decode(tokenString);
    const expSeconds =
      decoded && decoded.exp
        ? decoded.exp
        : Math.floor(Date.now() / 1000) + (type === "refresh" ? 7 * 86400 : 15 * 60);

    const expiresAt = new Date(expSeconds * 1000);

    return await BlacklistedToken.findOneAndUpdate(
      { token: tokenString },
      {
        token: tokenString,
        type,
        userId: userId || (decoded && decoded.id ? decoded.id : null),
        reason,
        expiresAt,
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (err) {
    console.warn("Blacklist token warning:", err.message);
    return null;
  }
}

// ── POST /api/auth/register ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    // Role validation: must be strictly student, admin, or instructor
    const normalizedRole = (role || "student").toString().trim().toLowerCase();
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role "${role}". Allowed roles: student, admin, instructor.`,
      });
    }

    // Check duplicate email in MongoDB
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists in the database.",
      });
    }

    const newUser = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      phone: (phone || "").trim(),
      role: normalizedRole,
      department: (department || "").trim(),
    });

    await newUser.save();

    console.log(
      `✅ New user registered in MongoDB: ${newUser.name} (${newUser.email}) [Role: ${newUser.role}]`
    );

    // Generate JWT tokens: Access Token (15 mins) & Refresh Token (7 days)
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    // Set Refresh Token as HTTP-only Cookie
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(201).json({
      success: true,
      message: "Account created successfully with JWT session.",
      user: newUser.toJSON(),
      tokenType: "Bearer",
      accessToken,
      expiresIn: 15 * 60, // 15 mins in seconds
      refreshToken,
      refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error during registration.",
    });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // DB lookup
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No user found in the database with this email. Please register first.",
      });
    }

    // Verify role if provided
    if (role) {
      const requestedRole = role.toString().trim().toLowerCase();
      if (user.role.toLowerCase() !== requestedRole) {
        return res.status(401).json({
          success: false,
          message: `This account is registered as "${user.role}", not "${role}".`,
        });
      }
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Generate JWT tokens: Access Token (15m) & Refresh Token (7d)
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set Refresh Token in secure HTTP-only cookie
    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "Login successful.",
      user: user.toJSON(),
      tokenType: "Bearer",
      accessToken,
      expiresIn: 15 * 60, // 15 mins in seconds
      refreshToken,
      refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login.",
    });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
// Issues a fresh 15-minute Access Token using the 7-day Refresh Token
router.post("/refresh", async (req, res) => {
  try {
    // 1. Get refresh token from HTTP-only cookie or fallback body/header
    const refreshToken =
      req.cookies?.refreshToken ||
      req.body?.refreshToken ||
      req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        code: "REFRESH_TOKEN_MISSING",
        message: "Refresh token is missing. Please log in again.",
      });
    }

    // 2. Check if the refresh token is blacklisted
    const isBlacklisted = await BlacklistedToken.findOne({ token: refreshToken });
    if (isBlacklisted) {
      res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        code: "REFRESH_TOKEN_REVOKED",
        message: "Refresh token has been revoked. Please log in again.",
      });
    }

    // 3. Verify refresh token signature & expiration (7 days)
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        code: "REFRESH_TOKEN_EXPIRED",
        message: "Refresh token has expired (7 days limit) or is invalid. Please log in again.",
      });
    }

    // 4. Verify user exists and is active
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
      return res.status(401).json({
        success: false,
        message: "User account no longer active or found.",
      });
    }

    // 5. Issue new Access Token (15m) & rotated Refresh Token (7d)
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Blacklist the old refresh token so it cannot be reused
    await blacklistToken(refreshToken, "refresh", user._id, "token_rotation");

    // Set new refresh token in cookie
    res.cookie("refreshToken", newRefreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "Access token successfully refreshed.",
      tokenType: "Bearer",
      accessToken: newAccessToken,
      expiresIn: 15 * 60, // 15 mins
      refreshToken: newRefreshToken,
      refreshExpiresIn: 7 * 24 * 60 * 60, // 7 days
      user: user.toJSON(),
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during token refresh.",
    });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────
// Blacklists active tokens in MongoDB and clears HTTP-only cookies
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const accessToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    let userId = null;

    // 1. Blacklist Access Token (if provided)
    if (accessToken) {
      const decodedAccess = jwt.decode(accessToken);
      if (decodedAccess?.id) userId = decodedAccess.id;
      await blacklistToken(accessToken, "access", userId, "user_logout");
      console.log(`🔒 Access token blacklisted in MongoDB`);
    }

    // 2. Blacklist Refresh Token (if found in cookie/body)
    if (refreshToken) {
      const decodedRefresh = jwt.decode(refreshToken);
      if (decodedRefresh?.id) userId = decodedRefresh.id;
      await blacklistToken(refreshToken, "refresh", userId, "user_logout");
      console.log(`🔒 Refresh token blacklisted in MongoDB`);
    }

    // 3. Clear the HTTP-only cookie
    res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);

    res.json({
      success: true,
      message: "Logged out successfully. All tokens have been revoked and blacklisted.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Error during logout.",
    });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
// Returns currently authenticated user details using verified JWT
router.get("/me", authenticateToken, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ── GET /api/auth/dashboard ──────────────────────────────────────────────────
// Returns authenticated student dashboard metrics, course progress, and stats
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("enrolledCourses");
    const courses = user.enrolledCourses || [];

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      stats: {
        enrolledCourses: courses.length || 1,
        inProgress: courses.length || 1,
        completed: 0,
        certificates: 0,
      },
      courses: courses.length > 0 ? courses : [
        {
          id: 2,
          title: "Node.js & Express.js Backend Masterclass",
          category: "Web Development",
          instructor: "Ananya Sharma",
          duration: "20 Hours",
          progress: 0,
        },
      ],
      recentActivity: [
        {
          title: "Enrolled in Node.js & Express.js Backend Masterclass",
          date: "2 Oct 2026",
          amount: "₹2,713 paid",
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching dashboard data." });
  }
});

// ── POST /api/auth/verify ────────────────────────────────────────────────────
// Backward-compatible verification
router.post("/verify", async (req, res) => {
  try {
    const { id, email } = req.body;
    let user = null;

    if (id) {
      user = await User.findById(id).catch(() => null);
    }
    if (!user && email) {
      user = await User.findOne({ email: email.trim().toLowerCase() });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database.",
      });
    }

    res.json({
      success: true,
      user: user.toJSON(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Verification error." });
  }
});

// ── GET /api/auth/users ──────────────────────────────────────────────────────
// Protected: Only Admin can view all registered users
router.get("/users", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error fetching users." });
  }
});

// ── POST /api/auth/users ─────────────────────────────────────────────────────
// Protected: Admin can create a new user (admin, instructor, or student)
router.post("/users", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { name, email, password, phone, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    const normalizedRole = (role || "admin").toString().trim().toLowerCase();
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role "${role}". Allowed roles: student, admin, instructor.`,
      });
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists in MongoDB.",
      });
    }

    const newUser = new User({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      phone: (phone || "").trim(),
      role: normalizedRole,
      department: (department || (normalizedRole === "instructor" ? "Technology" : "")).trim(),
    });

    await newUser.save();

    console.log(
      `🛡️ Admin (${req.user.email}) created new ${normalizedRole}: ${newUser.name} (${newUser.email})`
    );

    res.status(201).json({
      success: true,
      message: `${normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)} account created successfully.`,
      user: newUser.toJSON(),
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create user.",
    });
  }
});

// ── PATCH /api/auth/users/:id/role ───────────────────────────────────────────
// Protected: Admin can update any user's role (e.g., make someone an admin)
router.patch("/users/:id/role", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const normalizedRole = (role || "").toString().trim().toLowerCase();
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role "${role}". Allowed roles: ${ALLOWED_ROLES.join(", ")}.`,
      });
    }

    // Safety check: prevent an admin from demoting themselves
    if (req.user._id.toString() === id && normalizedRole !== "admin") {
      return res.status(400).json({
        success: false,
        message: "You cannot revoke your own administrator privileges.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const previousRole = user.role;
    user.role = normalizedRole;
    await user.save();

    console.log(
      `🔄 User role updated: ${user.email} (${previousRole} -> ${normalizedRole}) by admin ${req.user.email}`
    );

    res.json({
      success: true,
      message: `User "${user.name}" is now an ${normalizedRole.toUpperCase()}.`,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update user role.",
    });
  }
});

// ── PUT /api/auth/users/:id ──────────────────────────────────────────────────
// Protected: Admin can edit user/student details (Name, Email, Phone, Status)
router.put("/users/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, department, isActive, password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (department !== undefined) user.department = department.trim();
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    if (email && email.trim().toLowerCase() !== user.email) {
      const emailTaken = await User.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: id },
      });
      if (emailTaken) {
        return res.status(409).json({
          success: false,
          message: "Another user already has this email address.",
        });
      }
      user.email = email.trim().toLowerCase();
    }

    if (password && password.trim().length >= 6) {
      user.password = password;
    }

    await user.save();

    console.log(`✏️ User updated by admin: ${user.email} (${user.role})`);

    res.json({
      success: true,
      message: `User "${user.name}" updated successfully.`,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update user.",
    });
  }
});

// ── DELETE /api/auth/users/:id ───────────────────────────────────────────────
// Protected: Admin can delete a user
router.delete("/users/:id", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own admin account.",
      });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    console.log(`🗑️ User deleted by admin: ${user.email} (${user.role})`);

    res.json({
      success: true,
      message: `User "${user.name}" (${user.email}) has been deleted.`,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete user.",
    });
  }
});

// ── GET /api/auth/blacklisted ────────────────────────────────────────────────
// Admin inspection of active blacklisted tokens
router.get("/blacklisted", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const count = await BlacklistedToken.countDocuments();
    const tokens = await BlacklistedToken.find({}).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, count, tokens });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching blacklisted tokens." });
  }
});

module.exports = router;
