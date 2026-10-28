const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    instructor: {
      type: String,
      required: true,
    },
    instructorId: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      default: "Web Development",
    },
    price: {
      type: Number,
      default: 1999,
    },
    duration: {
      type: String,
      default: "10 Hours",
    },
    image: {
      type: String,
      default: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3",
    },
    videoUrl: {
      type: String,
      default: "",
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5,
    },
    students: {
      type: Number,
      default: 0,
    },
    modules: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    quiz: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    syllabus: {
      type: String,
      default: "",
    },
    requirements: {
      type: String,
      default: "",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
    },
    approvedBy: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Course", courseSchema);
