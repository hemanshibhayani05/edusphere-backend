const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: {
        values: ["student", "admin", "instructor"],
        message: "{VALUE} is not a valid role. Allowed roles: student, admin, instructor",
      },
      default: "student",
      set: (v) => (v ? v.toString().trim().toLowerCase() : "student"),
    },
    department: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    enrolledCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Hash password before saving (Mongoose 8+ async pre hook)
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Compare plain password with hashed
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Never return password in JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
