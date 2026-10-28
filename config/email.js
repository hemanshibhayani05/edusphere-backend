const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.log("❌ Gmail SMTP Error:");
    console.log(error);
  } else {
    console.log("✅ Gmail SMTP connection successful!");
  }
});

module.exports = transporter;