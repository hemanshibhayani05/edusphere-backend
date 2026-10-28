const express = require("express");
const router = express.Router();

const transporter = require("../config/email");

router.post("/login-notification", async (req, res) => {
  try {
    const { email, name, role, loginTime } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Student email is required.",
      });
    }

    const userRole = role || "Student";

    await transporter.sendMail({
      from: `"EduSphere Learning" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🔔 EduSphere Login Notification - ${userRole} Account`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Login Notification</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
                  
                  <!-- HEADER -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 30px; text-align: center;">
                      <div style="background: rgba(255,255,255,0.2); width: 54px; height: 54px; line-height: 54px; border-radius: 50%; margin: 0 auto 10px; font-size: 24px; color: #ffffff;">
                        🎓
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                        EduSphere Account Login
                      </h1>
                      <p style="margin: 4px 0 0; color: #e0e7ff; font-size: 13px;">
                        Security Alert &amp; Session Confirmation
                      </p>
                    </td>
                  </tr>

                  <!-- BODY CONTENT -->
                  <tr>
                    <td style="padding: 28px 28px 24px;">
                      <p style="margin: 0 0 14px; font-size: 16px; color: #1f2937;">
                        Hello <strong>${name || "Student"}</strong>,
                      </p>
                      <p style="margin: 0 0 20px; font-size: 14.5px; color: #4b5563; line-height: 1.5;">
                        You have successfully logged in to your <strong>EduSphere</strong> account. Here are your session details:
                      </p>

                      <!-- DETAILS BOX -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 22px; font-size: 13.5px;">
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Account Email:</td>
                          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #1e293b;">${email}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Account Role:</td>
                          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #4f46e5;">${userRole}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Login Timestamp:</td>
                          <td style="padding: 8px 0; text-align: right; color: #334155;">${loginTime}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #64748b;">Session Status:</td>
                          <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #16a34a;">Authorized / Active</td>
                        </tr>
                      </table>

                      <!-- CTA BUTTON -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                        <tr>
                          <td align="center">
                            <a href="http://localhost:3000/student/dashboard" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.25);">
                              Go to Student Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                        If this wasn't you, please reset your password immediately or contact our security team.
                      </p>
                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11.5px; color: #94a3b8;">
                      © ${new Date().getFullYear()} EduSphere Learning. Automated notification sent to ${email}.
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log(`✅ Login email sent to: ${email}`);

    res.status(200).json({
      success: true,
      message: "Login notification email sent successfully.",
    });

  } catch (error) {
    console.error("❌ Email sending error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/payment-confirmation", async (req, res) => {
  try {
    const {
      email,
      name,
      courseTitle,
      instructor,
      amount,
      basePrice,
      gst,
      paymentId,
      orderId,
      paymentMethod,
      paymentMethodDetails,
      paymentTime,
    } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Student email is required.",
      });
    }

    // Determine icon based on payment method
    let methodIcon = "💳";
    const lowerMethod = (paymentMethod || "").toLowerCase();
    if (lowerMethod.includes("upi")) methodIcon = "📱";
    else if (lowerMethod.includes("bank")) methodIcon = "🏦";
    else if (lowerMethod.includes("wallet")) methodIcon = "👛";

    await transporter.sendMail({
      from: `"EduSphere Learning" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🎉 Payment Receipt & Enrollment Confirmation - ${courseTitle || "EduSphere Course"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Receipt</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
                  
                  <!-- HEADER -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 30px; text-align: center;">
                      <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; line-height: 60px; border-radius: 50%; margin: 0 auto 12px; font-size: 28px; color: #ffffff;">
                        ✓
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                        Payment Successful!
                      </h1>
                      <p style="margin: 6px 0 0; color: #e0e7ff; font-size: 14px;">
                        Thank you for enrolling with EduSphere
                      </p>
                    </td>
                  </tr>

                  <!-- BODY CONTENT -->
                  <tr>
                    <td style="padding: 32px 30px;">
                      <p style="margin: 0 0 16px; font-size: 16px; color: #1f2937;">
                        Hello <strong>${name || "Student"}</strong>,
                      </p>
                      <p style="margin: 0 0 24px; font-size: 15px; color: #4b5563; line-height: 1.5;">
                        Your payment has been successfully processed! You have been granted lifetime access to <strong>${courseTitle}</strong>. Below are your transaction and payment method details.
                      </p>

                      <!-- PAYMENT METHOD HIGHLIGHT CARD -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                        <tr>
                          <td style="padding: 18px 20px;">
                            <div style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 6px;">
                              Payment Method Used
                            </div>
                            <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                              <span style="margin-right: 8px;">${methodIcon}</span>
                              <span>${paymentMethod || "Razorpay Payment"}</span>
                            </div>
                            <div style="font-size: 14px; color: #475569; font-weight: 500;">
                              ${paymentMethodDetails || paymentMethod || "Standard Payment"}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <!-- TRANSACTION DETAILS TABLE -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 10px 0; color: #64748b;">Course Enrolled:</td>
                          <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #1e293b;">${courseTitle}</td>
                        </tr>
                        ${instructor ? `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 10px 0; color: #64748b;">Instructor:</td>
                          <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #1e293b;">${instructor}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 10px 0; color: #64748b;">Payment ID:</td>
                          <td style="padding: 10px 0; text-align: right; font-family: monospace; font-weight: 600; color: #4f46e5;">${paymentId}</td>
                        </tr>
                        ${orderId ? `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 10px 0; color: #64748b;">Order ID:</td>
                          <td style="padding: 10px 0; text-align: right; font-family: monospace; color: #475569;">${orderId}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 10px 0; color: #64748b;">Date & Time:</td>
                          <td style="padding: 10px 0; text-align: right; color: #334155;">${paymentTime || new Date().toLocaleString()}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 10px 0; color: #64748b;">Status:</td>
                          <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #16a34a;">PAID / SUCCESS</td>
                        </tr>
                      </table>

                      <!-- RECEIPT BREAKDOWN -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 14px;">
                        ${basePrice ? `
                        <tr>
                          <td style="padding: 6px 0; color: #6b7280;">Course Fee:</td>
                          <td style="padding: 6px 0; text-align: right; color: #374151;">₹${Number(basePrice).toLocaleString()}</td>
                        </tr>
                        ` : ''}
                        ${gst ? `
                        <tr>
                          <td style="padding: 6px 0; color: #6b7280;">GST (18%):</td>
                          <td style="padding: 6px 0; text-align: right; color: #374151;">₹${Number(gst).toLocaleString()}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-top: 1px dashed #d1d5db;">
                          <td style="padding: 10px 0 4px; font-weight: 700; color: #111827; font-size: 16px;">Total Paid:</td>
                          <td style="padding: 10px 0 4px; text-align: right; font-weight: 700; color: #4f46e5; font-size: 18px;">₹${Number(amount).toLocaleString()}</td>
                        </tr>
                      </table>

                      <!-- CTA BUTTON -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                        <tr>
                          <td align="center">
                            <a href="http://localhost:3000/student/courses" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                              Go to My Courses & Start Learning →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5; text-align: center;">
                        Need help? Contact our support team at <a href="mailto:support@edusphere.com" style="color: #4f46e5; text-decoration: none;">support@edusphere.com</a>.
                      </p>
                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center; font-size: 12px; color: #94a3b8;">
                      © ${new Date().getFullYear()} EduSphere Learning Platform. All rights reserved.<br>
                      This is an automated confirmation of your transaction via Razorpay Payment Gateway.
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log(`✅ Payment receipt email sent to: ${email} for course: ${courseTitle} (Method: ${paymentMethod})`);

    res.status(200).json({
      success: true,
      message: "Payment confirmation email sent successfully.",
    });

  } catch (error) {
    console.error("❌ Email sending error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ── POST /api/email/instructor-payout-notification ─────────────────────────
router.post("/instructor-payout-notification", async (req, res) => {
  try {
    const {
      instructorEmail,
      instructorName,
      payoutId,
      totalCourseRevenue,
      adminCommissionAmount,
      netPayoutAmount,
      paymentMethod,
      transactionReference,
      paymentDate,
      notes,
    } = req.body;

    if (!instructorEmail) {
      return res.status(400).json({
        success: false,
        message: "Instructor email is required.",
      });
    }

    const formattedDate = paymentDate
      ? new Date(paymentDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : new Date().toLocaleDateString("en-IN");

    await transporter.sendMail({
      from: `"EduSphere Admin Finance" <${process.env.EMAIL_USER}>`,
      to: instructorEmail,
      subject: `💰 EduSphere Faculty Disbursement - Payout Ref #${payoutId || "PAYOUT"}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Instructor Payout Disbursement</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                  
                  <!-- HEADER -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 30px; text-align: center;">
                      <div style="background: #2563eb; width: 56px; height: 56px; line-height: 56px; border-radius: 50%; margin: 0 auto 12px; font-size: 26px; color: #ffffff;">
                        💸
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                        EduSphere Faculty Disbursement
                      </h1>
                      <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13.5px;">
                        Instructor Earnings Payout &amp; Commission Statement
                      </p>
                    </td>
                  </tr>

                  <!-- BODY CONTENT -->
                  <tr>
                    <td style="padding: 30px 30px 24px;">
                      <p style="margin: 0 0 16px; font-size: 16px; color: #0f172a;">
                        Dear <strong>${instructorName || "Instructor"}</strong>,
                      </p>
                      <p style="margin: 0 0 22px; font-size: 14.5px; color: #475569; line-height: 1.6;">
                        We are pleased to inform you that Admin has processed your instructor earnings disbursement. All student course payments collected directly by the platform have been reconciled, our <strong>10% Platform Hosting Commission</strong> has been applied, and your <strong>90% Net Payout</strong> has been disbursed.
                      </p>

                      <!-- PAYOUT SUMMARY CARD -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                        <tr>
                          <td style="color: #166534; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            Net Disbursed to You (90%)
                          </td>
                        </tr>
                        <tr>
                          <td style="font-size: 32px; font-weight: 800; color: #15803d; padding-top: 4px;">
                            ₹${Number(netPayoutAmount || 0).toLocaleString()}
                          </td>
                        </tr>
                        <tr>
                          <td style="font-size: 12px; color: #15803d; padding-top: 4px;">
                            Status: <strong>PAID &amp; TRANSFERRED</strong>
                          </td>
                        </tr>
                      </table>

                      <!-- COMMISSION & SETTLEMENT BREAKDOWN -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 24px; font-size: 13.5px;">
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Payout Reference ID:</td>
                          <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace;">${payoutId || "PAYOUT-" + Date.now()}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Disbursement Date:</td>
                          <td style="padding: 8px 0; text-align: right; color: #334155; font-weight: 600;">${formattedDate}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Disbursement Method:</td>
                          <td style="padding: 8px 0; text-align: right; color: #334155; font-weight: 600;">${paymentMethod || "Bank Transfer"}</td>
                        </tr>
                        ${transactionReference ? `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">UTR / Transaction Ref:</td>
                          <td style="padding: 8px 0; text-align: right; color: #2563eb; font-weight: 600; font-family: monospace;">${transactionReference}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #64748b;">Total Student Course Sales:</td>
                          <td style="padding: 8px 0; text-align: right; color: #0f172a; font-weight: 600;">₹${Number(totalCourseRevenue || 0).toLocaleString()}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 8px 0; color: #dc2626;">Admin Commission (10% Fee):</td>
                          <td style="padding: 8px 0; text-align: right; color: #dc2626; font-weight: 600;">- ₹${Number(adminCommissionAmount || 0).toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0 2px; font-weight: 700; color: #0f172a; font-size: 15px;">Net Instructor Payout (90%):</td>
                          <td style="padding: 10px 0 2px; text-align: right; font-weight: 800; color: #16a34a; font-size: 17px;">₹${Number(netPayoutAmount || 0).toLocaleString()}</td>
                        </tr>
                      </table>

                      ${notes ? `
                      <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px; font-size: 13px; color: #1e40af;">
                        <strong>Admin Note:</strong> ${notes}
                      </div>
                      ` : ''}

                      <!-- CTA BUTTON -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                        <tr>
                          <td align="center">
                            <a href="http://localhost:5000/instructor/dashboard" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 14px 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                              Open Instructor Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 12.5px; color: #94a3b8; line-height: 1.5; text-align: center;">
                        For payout queries or bank detail updates, contact EduSphere Finance at <a href="mailto:finance@edusphere.com" style="color: #2563eb; text-decoration: none;">finance@edusphere.com</a>.
                      </p>
                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center; font-size: 12px; color: #94a3b8;">
                      © ${new Date().getFullYear()} EduSphere Learning Platform. All rights reserved.<br>
                      This electronic voucher confirms faculty revenue disbursement.
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log(`✅ Faculty payout disbursement email sent to: ${instructorEmail} (Amount: ₹${netPayoutAmount})`);

    res.status(200).json({
      success: true,
      message: "Payout notification email sent to instructor successfully.",
    });
  } catch (error) {
    console.error("❌ Payout notification email error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;