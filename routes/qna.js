const express = require("express");
const router = express.Router();
const QnaQuestion = require("../models/QnaQuestion");
const Course = require("../models/Course");

// GET /api/qna - Get questions (filterable by courseId, instructorId, studentId, status)
router.get("/", async (req, res) => {
  try {
    const { courseId, instructorId, studentId, instructorName, status } = req.query;
    const filter = {};

    if (courseId) {
      filter.courseId = String(courseId);
    }
    if (studentId) {
      filter.studentId = String(studentId);
    }
    if (status) {
      filter.status = String(status).toLowerCase();
    }

    if (instructorId || instructorName) {
      const orConditions = [];
      if (instructorId) {
        orConditions.push({ instructorId: String(instructorId) });
      }
      if (instructorName) {
        orConditions.push({
          instructorName: { $regex: new RegExp(`^${instructorName}$`, "i") },
        });
      }
      if (orConditions.length > 0) {
        filter.$or = orConditions;
      }
    }

    const questions = await QnaQuestion.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: questions.length,
      questions,
    });
  } catch (err) {
    console.error("Error fetching Q&A questions:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve Q&A inquiries.",
      error: err.message,
    });
  }
});

// POST /api/qna - Student asks a question
router.post("/", async (req, res) => {
  try {
    const {
      courseId,
      courseTitle,
      lessonId,
      lessonTitle,
      instructorId,
      instructorName,
      studentId,
      studentName,
      studentEmail,
      title,
      question,
    } = req.body;

    if (!courseId || !title || !question || !studentName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: courseId, studentName, title, and question are required.",
      });
    }

    // Attempt to lookup instructor details if missing
    let finalInstructorId = instructorId || "";
    let finalInstructorName = instructorName || "";
    let finalCourseTitle = courseTitle || "Course";

    if (!finalInstructorName || !finalInstructorId) {
      try {
        const foundCourse = await Course.findById(courseId).lean();
        if (foundCourse) {
          finalInstructorId = finalInstructorId || foundCourse.instructorId || "";
          finalInstructorName = finalInstructorName || foundCourse.instructor || "";
          finalCourseTitle = finalCourseTitle || foundCourse.title || "Course";
        }
      } catch (_) {
        // Course ID might not be a MongoDB ObjectID (could be mock data)
      }
    }

    const newQuestion = new QnaQuestion({
      courseId: String(courseId),
      courseTitle: finalCourseTitle,
      lessonId: lessonId || "",
      lessonTitle: lessonTitle || "",
      instructorId: finalInstructorId,
      instructorName: finalInstructorName,
      studentId: studentId || "",
      studentName: studentName.trim(),
      studentEmail: studentEmail || "",
      title: title.trim(),
      question: question.trim(),
      status: "pending",
      answers: [],
    });

    await newQuestion.save();

    return res.status(201).json({
      success: true,
      message: "Your question has been posted successfully!",
      question: newQuestion,
    });
  } catch (err) {
    console.error("Error creating Q&A question:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to post question.",
      error: err.message,
    });
  }
});

// POST /api/qna/:id/answer - Instructor (or admin) replies to a question
router.post("/:id/answer", async (req, res) => {
  try {
    const { id } = req.params;
    const { authorId, authorName, authorRole, answerText } = req.body;

    if (!answerText || !authorName) {
      return res.status(400).json({
        success: false,
        message: "authorName and answerText are required.",
      });
    }

    const questionDoc = await QnaQuestion.findById(id);
    if (!questionDoc) {
      return res.status(404).json({
        success: false,
        message: "Question not found.",
      });
    }

    questionDoc.answers.push({
      authorId: authorId || "",
      authorName: authorName.trim(),
      authorRole: authorRole || "instructor",
      answerText: answerText.trim(),
      createdAt: new Date(),
    });

    questionDoc.status = "answered";
    await questionDoc.save();

    return res.json({
      success: true,
      message: "Reply posted successfully!",
      question: questionDoc,
    });
  } catch (err) {
    console.error("Error answering Q&A question:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to post reply.",
      error: err.message,
    });
  }
});

// DELETE /api/qna/:id - Delete question (Instructor or Admin)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await QnaQuestion.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Question not found.",
      });
    }

    return res.json({
      success: true,
      message: "Question deleted successfully.",
    });
  } catch (err) {
    console.error("Error deleting question:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete question.",
      error: err.message,
    });
  }
});

module.exports = router;
