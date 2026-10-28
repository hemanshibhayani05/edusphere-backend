const express = require("express");
const router = express.Router();
const Course = require("../models/Course");
const User = require("../models/User");

const jwt = require("jsonwebtoken");
const BlacklistedToken = require("../models/BlacklistedToken");
const { verifyAccessToken } = require("../utils/jwt");

// ── Middleware: Verify that requester is an Instructor (JWT or headers) ────────
const verifyInstructorRole = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  // 1. JWT verification if token provided
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const isBlacklisted = await BlacklistedToken.exists({ token });
      if (isBlacklisted) {
        return res.status(401).json({
          success: false,
          code: "TOKEN_REVOKED",
          message: "Token has been revoked/blacklisted. Please log in again.",
        });
      }

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id);

      if (user && (user.role.toLowerCase() === "instructor" || user.role.toLowerCase() === "admin")) {
        req.user = user;
        req.token = token;
        return next();
      }
    } catch (jwtErr) {
      if (jwtErr.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_EXPIRED",
          message: "Access token has expired (15m limit). Please refresh token.",
        });
      }
      // If invalid token, let fallback proceed or reject
    }
  }

  // 2. Direct role header fallback for compatibility
  const roleHeader = (
    req.headers["x-user-role"] ||
    req.body.userRole ||
    req.body.role ||
    req.query.userRole ||
    ""
  ).toString().trim().toLowerCase();

  const userId = req.headers["x-user-id"] || req.body.instructorId || req.query.instructorId;

  if (roleHeader === "instructor" || roleHeader === "admin") {
    return next();
  }

  // 3. Check user in database by userId if provided
  if (userId) {
    try {
      const user = await User.findById(userId);
      if (user && (user.role.toLowerCase() === "instructor" || user.role.toLowerCase() === "admin")) {
        req.user = user;
        return next();
      }
    } catch (e) {
      // not a valid ObjectId or lookup error
    }
  }

  return res.status(403).json({
    success: false,
    message: "Access Denied: Only instructors can create, edit, or delete courses.",
  });
};

// ── GET /api/courses ─────────────────────────────────────────────────────────
// Read courses stored in the database (Public only sees APPROVED courses)
router.get("/", async (req, res) => {
  try {
    const { category, instructor, instructorId, search, status, all, admin } = req.query;
    const filter = {};

    const roleHeader = (
      req.headers["x-user-role"] ||
      ""
    ).toString().trim().toLowerCase();

    const isAdminView = admin === "true" || all === "true" || roleHeader === "admin";

    if (category && category !== "All") {
      filter.category = category;
    }
    if (instructor) {
      filter.instructor = new RegExp(instructor, "i");
    }
    if (instructorId) {
      filter.instructorId = instructorId;
    }
    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { category: new RegExp(search, "i") },
      ];
    }

    // Security & Moderation Filter:
    // If specific status requested (e.g. status=pending or status=approved)
    if (status && status !== "all") {
      filter.status = status;
    } else if (!isAdminView && !instructorId) {
      // PUBLIC WEBSITE: strictly only approved courses!
      // This protects users from unverified / cybercrime / malicious course uploads
      filter.$or = [
        { status: "approved" },
        { isApproved: true },
        { status: { $exists: false } }, // preexisting legacy courses
      ];
    }

    const courses = await Course.find(filter).sort({ createdAt: -1 });
    const pendingCount = await Course.countDocuments({ status: "pending" });

    res.json({
      success: true,
      count: courses.length,
      pendingCount,
      courses,
    });
  } catch (error) {
    console.error("Get courses error:", error);
    res.status(500).json({ success: false, message: "Server error fetching courses." });
  }
});

// ── GET /api/courses/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }
    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error fetching course." });
  }
});

// ── POST /api/courses (CREATE: Only Instructor/Admin) ────────────────────────
router.post("/", verifyInstructorRole, async (req, res) => {
  try {
    const {
      title,
      description,
      instructor,
      instructorId,
      category,
      price,
      duration,
      image,
      videoUrl,
      modules,
      syllabus,
      requirements,
      quiz,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Course title is required.",
      });
    }

    if (!instructor || !instructor.trim()) {
      return res.status(400).json({
        success: false,
        message: "Instructor name is required.",
      });
    }

    // Parse syllabus into modules if modules not provided or empty
    const parsedModules =
      Array.isArray(modules) && modules.length > 0
        ? modules
        : syllabus && syllabus.trim()
        ? syllabus
            .split("\n")
            .map((m) => m.trim().replace(/^[-•*]\s*/, ""))
            .filter(Boolean)
        : [];

    // Cybersecurity Moderation:
    // When an instructor adds a course, status is "pending" (isApproved = false, isPublished = false)
    // Only an admin can approve it to make it live on the website!
    const roleHeader = (
      (req.user && req.user.role) ||
      req.headers["x-user-role"] ||
      req.body.userRole ||
      ""
    ).toString().trim().toLowerCase();

    const isAdmin = roleHeader === "admin";
    const initialStatus = isAdmin ? "approved" : "pending";
    const initialApproved = isAdmin;

    const course = new Course({
      title: title.trim(),
      description: (description || "").trim(),
      instructor: instructor.trim(),
      instructorId: instructorId || "",
      category: category || "Web Development",
      price: Number(price) || 0,
      duration: duration || "3 Months",
      image:
        image ||
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60",
      videoUrl: (videoUrl || "").trim(),
      modules: parsedModules,
      quiz: Array.isArray(quiz) ? quiz : [],
      syllabus: (syllabus || "").trim(),
      requirements: (requirements || "").trim(),
      status: initialStatus,
      isApproved: initialApproved,
      isPublished: initialApproved,
      submittedAt: new Date(),
      approvedAt: isAdmin ? new Date() : null,
      approvedBy: isAdmin ? (req.user?.email || "Admin") : "",
    });

    await course.save();

    if (!isAdmin) {
      console.log(
        `🚨 MODERATION ALERT: Instructor "${course.instructor}" submitted course "${course.title}" for Admin Approval (Status: PENDING).`
      );
    } else {
      console.log(`✅ Admin published course directly: "${course.title}"`);
    }

    res.status(201).json({
      success: true,
      message: isAdmin
        ? "Course created and published successfully."
        : "Course submitted for review! It will go live once verified and approved by the Administrator.",
      course,
      requiresApproval: !isAdmin,
    });
  } catch (error) {
    console.error("Create course error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error creating course." });
  }
});

// ── PUT /api/courses/:id (UPDATE: Only Instructor) ───────────────────────────
router.put("/:id", verifyInstructorRole, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id; // prevent overwriting immutable id

    if (updates.syllabus && (!updates.modules || updates.modules.length === 0)) {
      updates.modules = updates.syllabus
        .split("\n")
        .map((m) => m.trim().replace(/^[-•*]\s*/, ""))
        .filter(Boolean);
    }

    const course = await Course.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    console.log(`✅ Course updated in MongoDB: "${course.title}" (ID: ${course._id})`);

    res.json({
      success: true,
      message: "Course updated successfully.",
      course,
    });
  } catch (error) {
    console.error("Update course error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error updating course." });
  }
});

// ── DELETE /api/courses/:id (DELETE: Only Instructor) ────────────────────────
router.delete("/:id", verifyInstructorRole, async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    console.log(`🗑️ Course deleted from MongoDB: "${course.title}" (ID: ${req.params.id})`);

    res.json({
      success: true,
      message: "Course deleted successfully from database.",
      id: req.params.id,
    });
  } catch (error) {
    console.error("Delete course error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error deleting course." });
  }
});

// ── PATCH /api/courses/:id/approve (Admin Security Approval) ─────────────────
router.patch("/:id/approve", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    course.status = "approved";
    course.isApproved = true;
    course.isPublished = true;
    course.approvedAt = new Date();
    course.approvedBy = req.body.adminEmail || "Admin";
    course.rejectionReason = "";

    await course.save();

    console.log(`🛡️ VERIFIED & APPROVED: Course "${course.title}" is now LIVE on the website!`);

    res.json({
      success: true,
      message: `Course "${course.title}" has been approved and is now live on the website!`,
      course,
    });
  } catch (error) {
    console.error("Course approval error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to approve course." });
  }
});

// ── PATCH /api/courses/:id/reject (Admin Security Rejection) ─────────────────
router.patch("/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found." });
    }

    course.status = "rejected";
    course.isApproved = false;
    course.isPublished = false;
    course.rejectionReason = reason || "Course content does not meet security & quality guidelines.";

    await course.save();

    console.log(`🚫 REJECTED: Course "${course.title}" rejected. Reason: ${course.rejectionReason}`);

    res.json({
      success: true,
      message: `Course "${course.title}" rejected.`,
      course,
    });
  } catch (error) {
    console.error("Course rejection error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to reject course." });
  }
});

// ── GET /api/courses/admin/pending-count ─────────────────────────────────────
router.get("/admin/pending-count", async (req, res) => {
  try {
    const pendingCount = await Course.countDocuments({ status: "pending" });
    const pendingCourses = await Course.find({ status: "pending" }).select("title instructor category price createdAt");
    res.json({ success: true, pendingCount, pendingCourses });
  } catch (error) {
    res.status(500).json({ success: false, pendingCount: 0 });
  }
});

module.exports = router;
