const mongoose = require("mongoose");

const blacklistedTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["access", "refresh"],
      default: "access",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reason: {
      type: String,
      default: "logout",
    },
    expiresAt: {
      type: Date,
      required: true,
      // MongoDB TTL Index: automatically deletes document once expiresAt is reached
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("BlacklistedToken", blacklistedTokenSchema);
