const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const BlacklistedToken = require("../models/BlacklistedToken");
const transporter = require("../config/email");
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

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
// Sends a password reset link to user email (student or instructor)
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address. Please verify your email or register.",
      });
    }

    // Role check if provided
    if (role) {
      const requestedRole = role.toString().trim().toLowerCase();
      if (user.role.toLowerCase() !== requestedRole) {
        return res.status(400).json({
          success: false,
          message: `This account is registered as "${user.role}", not "${role}". Please select "${user.role.charAt(0).toUpperCase() + user.role.slice(1)}" to continue.`,
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact support.",
      });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Token expires in 1 hour
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Determine client frontend URL
    const origin = req.headers.origin || req.headers.referer;
    let clientBaseUrl = process.env.FRONTEND_URL || "https://edusphere-frontend-two.vercel.app";
    if (origin) {
      try {
        const parsed = new URL(origin);
        clientBaseUrl = `${parsed.protocol}//${parsed.host}`;
      } catch (_) {
        clientBaseUrl = origin.replace(/\/$/, "");
      }
    }

    const resetUrl = `${clientBaseUrl}/reset-password/${resetToken}`;
    const formattedRole = user.role.charAt(0).toUpperCase() + user.role.slice(1);

    // Send reset email via Nodemailer
    let emailSent = false;
    try {
      await transporter.sendMail({
        from: `"EduSphere Security" <${process.env.EMAIL_USER || "hemanshibhayani05@gmail.com"}>`,
      to: user.email,
      subject: `🔑 Reset Your EduSphere Password (${formattedRole} Account)`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
                  
                  <!-- HEADER -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px 30px; text-align: center;">
                      <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; line-height: 60px; border-radius: 50%; margin: 0 auto 12px; font-size: 28px; color: #ffffff;">
                        🔑
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                        Password Reset Request
                      </h1>
                      <p style="margin: 6px 0 0; color: #e0e7ff; font-size: 13.5px;">
                        EduSphere Learning Platform
                      </p>
                    </td>
                  </tr>

                  <!-- BODY CONTENT -->
                  <tr>
                    <td style="padding: 32px 30px 24px;">
                      <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">
                        Hello <strong>${user.name || formattedRole}</strong>,
                      </p>
                      <p style="margin: 0 0 20px; font-size: 14.5px; color: #4b5563; line-height: 1.6;">
                        We received a request to reset the password for your <strong>${formattedRole}</strong> account associated with <strong>${user.email}</strong>.
                      </p>
                      <p style="margin: 0 0 24px; font-size: 14.5px; color: #4b5563; line-height: 1.6;">
                        Click the button below to choose a new password. This reset link is valid for <strong>60 minutes</strong>.
                      </p>

                      <!-- CTA BUTTON -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
                        <tr>
                          <td align="center">
                            <a href="${resetUrl}" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35); letter-spacing: 0.3px;">
                              Reset My Password →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <!-- DETAILS BOX -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; margin-bottom: 22px; font-size: 13px;">
                        <tr>
                          <td style="color: #64748b; padding: 4px 0;">Account Role:</td>
                          <td style="text-align: right; font-weight: 600; color: #4f46e5; padding: 4px 0;">${formattedRole}</td>
                        </tr>
                        <tr>
                          <td style="color: #64748b; padding: 4px 0;">Account Email:</td>
                          <td style="text-align: right; font-weight: 600; color: #1e293b; padding: 4px 0;">${user.email}</td>
                        </tr>
                        <tr>
                          <td style="color: #64748b; padding: 4px 0;">Link Validity:</td>
                          <td style="text-align: right; color: #e11d48; font-weight: 600; padding: 4px 0;">1 Hour (60 mins)</td>
                        </tr>
                      </table>

                      <p style="margin: 0 0 12px; font-size: 13px; color: #64748b; line-height: 1.5;">
                        If the button above does not work, copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0 0 24px; font-size: 12px; word-break: break-all; background: #f1f5f9; padding: 10px 14px; border-radius: 6px; color: #475569; font-family: monospace;">
                        <a href="${resetUrl}" style="color: #4f46e5; text-decoration: underline;">${resetUrl}</a>
                      </p>

                      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 14px; border-radius: 6px; margin-bottom: 8px;">
                        <p style="margin: 0; font-size: 12.5px; color: #92400e; line-height: 1.5;">
                          <strong>Security Note:</strong> If you did not make this request, you can safely ignore this email. Your password will remain unchanged and your account is secure.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
                      © ${new Date().getFullYear()} EduSphere Learning Platform. Automated security notification sent to ${user.email}.
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

      emailSent = true;
      console.log(`✅ Password reset link emailed to: ${user.email} (${user.role})`);
    } catch (mailErr) {
      console.warn("⚠️ Mail send error:", mailErr.message);
    }

    res.json({
      success: true,
      message: emailSent
        ? `A password reset link has been sent to ${user.email}. Please check your inbox and spam folder.`
        : `Password reset link generated for ${user.email}.`,
      resetUrl,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process password reset request.",
    });
  }
});

// ── GET /api/auth/verify-reset-token/:token ──────────────────────────────────
// Validates if a password reset token is active and unexpired
router.get("/verify-reset-token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required.",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired. Please request a new one.",
      });
    }

    res.json({
      success: true,
      message: "Token is valid.",
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    res.status(500).json({
      success: false,
      message: "Server error verifying reset token.",
    });
  }
});

// ── POST /api/auth/reset-password/:token ─────────────────────────────────────
// Resets user password using the verified token
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required.",
      });
    }

    if (!password || password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset link is invalid or has expired. Please request a new one.",
      });
    }

    // Set new plain password (pre-save hook will hash it with bcrypt)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    console.log(`🔐 Password successfully reset for user: ${user.email} (${user.role})`);

    // Fire-and-forget confirmation email
    transporter.sendMail({
      from: `"EduSphere Security" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `✅ EduSphere Password Successfully Updated`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
          <h2 style="color: #16a34a; margin-top: 0;">Password Successfully Changed</h2>
          <p style="color: #374151; font-size: 15px;">Hello <strong>${user.name}</strong>,</p>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
            The password for your EduSphere <strong>${user.role}</strong> account (${user.email}) was successfully changed on <strong>${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</strong>.
          </p>
          <p style="color: #4b5563; font-size: 14px;">
            You can now log in using your new credentials.
          </p>
          <p style="color: #dc2626; font-size: 13px; margin-top: 20px;">
            If you did not make this change, please contact our security team immediately.
          </p>
          <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} EduSphere Learning Platform</p>
        </div>
      `,
    }).catch((err) => {
      console.warn("Failed to send password reset confirmation email:", err.message);
    });

    res.json({
      success: true,
      message: "Your password has been successfully reset! You can now log in with your new password.",
      role: user.role,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password.",
    });
  }
});

module.exports = router;
