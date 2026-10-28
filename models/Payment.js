const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      default: "",
    },
    studentName: {
      type: String,
      required: [true, "Student name is required"],
      trim: true,
    },
    studentEmail: {
      type: String,
      required: [true, "Student email is required"],
      trim: true,
      lowercase: true,
    },
    studentPhone: {
      type: String,
      default: "+91 98765 43210",
      trim: true,
    },
    courseId: {
      type: String,
      required: true,
    },
    courseTitle: {
      type: String,
      required: true,
      trim: true,
    },
    instructor: {
      type: String,
      default: "EduSphere Faculty",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    basePrice: {
      type: Number,
      default: 0,
    },
    gst: {
      type: Number,
      default: 0,
    },
    paymentId: {
      type: String,
      required: true,
      trim: true,
    },
    orderId: {
      type: String,
      required: true,
      trim: true,
    },
    paymentMethod: {
      type: String,
      default: "UPI QR Scanner",
    },
    paymentMethodDetails: {
      type: String,
      default: "UPI Instant Payment (No PIN)",
    },
    status: {
      type: String,
      enum: ["paid", "completed", "pending", "refunded", "failed"],
      default: "paid",
    },
    paid: {
      type: Boolean,
      default: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
