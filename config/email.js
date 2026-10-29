const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || "hemanshibhayani05@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "ascmikpovratqyjm",
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

transporter.verify((error, success) => {
  if (error) {
    console.log("❌ Gmail SMTP Error:", error.message);
  } else {
    console.log("✅ Gmail SMTP connection successful!");
  }
});

module.exports = transporter;
