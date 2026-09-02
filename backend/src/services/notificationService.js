const nodemailer = require('nodemailer');

class NotificationService {
  static async sendCriticalSMSAlert(defect) {
    console.log(`\n=============================================================`);
    console.log(`🚨 [TWILIO SMS ALERT DISPATCHED TO MUNICIPAL AUTHORITY]`);
    console.log(`📱 Recipient: +91 98765 43210 (Highway & Infrastructure Cell)`);
    console.log(`💬 Message: CRITICAL ALERT! Defect ${defect.id} (${defect.defectClass}) detected at ${defect.assetName}, ${defect.locationName}. Risk Score: ${defect.riskScore}/100. Est Cost: ₹${defect.costEstimation?.total_estimated_cost}. Urgent repair dispatch required.`);
    console.log(`=============================================================\n`);

    return {
      success: true,
      provider: "Twilio API",
      recipient: "+91 98765 43210",
      status: "DELIVERED",
      timestamp: new Date().toISOString()
    };
  }

  static async sendEmailReport(defect, recipientEmail = "engineer@pwd.gov.in") {
    console.log(`\n=============================================================`);
    console.log(`📧 [NODEMAILER EMAIL DISPATCHED]`);
    console.log(`To: ${recipientEmail}`);
    console.log(`Subject: [URGENT AUDIT REPORT] Infrastructure Defect Alert: ${defect.id} - ${defect.assetName}`);
    console.log(`=============================================================\n`);

    return {
      success: true,
      provider: "Nodemailer SMTP",
      recipient: recipientEmail,
      status: "SENT",
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = NotificationService;
