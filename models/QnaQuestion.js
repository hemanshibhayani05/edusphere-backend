const mongoose = require("mongoose");

const qnaAnswerSchema = new mongoose.Schema(
  {
    authorId: {
      type: String,
      default: "",
    },
    authorName: {
      type: String,
      required: true,
      trim: true,
    },
    authorRole: {
      type: String,
      enum: ["instructor", "admin", "student"],
      default: "instructor",
    },
    answerText: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const qnaQuestionSchema = new mongoose.Schema(
  {
    courseId: {
      type: String,
      required: true,
      trim: true,
    },
    courseTitle: {
      type: String,
      default: "Course Discussion",
      trim: true,
    },
    lessonId: {
      type: String,
      default: "",
      trim: true,
    },
    lessonTitle: {
      type: String,
      default: "",
      trim: true,
    },
    instructorId: {
      type: String,
      default: "",
      trim: true,
    },
    instructorName: {
      type: String,
      default: "",
      trim: true,
    },
    studentId: {
      type: String,
      default: "",
      trim: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    studentEmail: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "answered"],
      default: "pending",
    },
    answers: [qnaAnswerSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("QnaQuestion", qnaQuestionSchema);
