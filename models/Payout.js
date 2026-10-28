const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
  {
    payoutId: {
      type: String,
      required: true,
      unique: true,
    },
    instructorId: {
      type: String,
      required: true,
    },
    instructorName: {
      type: String,
      required: true,
    },
    instructorEmail: {
      type: String,
      required: true,
    },
    totalCourseRevenue: {
      type: Number,
      required: true,
    },
    adminCommissionRate: {
      type: Number,
      default: 10,
    },
    adminCommissionAmount: {
      type: Number,
      required: true,
    },
    netPayoutAmount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["Bank Transfer (NEFT/RTGS)", "UPI Transfer", "Razorpay Route", "Cheque / DD"],
      default: "Bank Transfer (NEFT/RTGS)",
    },
    transactionReference: {
      type: String,
      default: "",
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["processed", "completed", "pending"],
      default: "completed",
    },
    notifiedViaEmail: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payout", payoutSchema);
