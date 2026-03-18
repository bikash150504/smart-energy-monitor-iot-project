/**
 * Notifications — Email (Nodemailer) + SMS (Twilio)
 */
const nodemailer = require('nodemailer');
const twilio     = require('twilio');

const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const lastNotified = {};
const COOLDOWN_MS  = 10 * 60 * 1000;

function shouldNotify(type) {
  const now = Date.now();
  if (!lastNotified[type] || now - lastNotified[type] > COOLDOWN_MS) {
    lastNotified[type] = now;
    return true;
  }
  return false;
}

async function sendEmailAlert(alert) {
  if (!shouldNotify(`email_${alert.type}`)) return;
  if (!process.env.ALERT_EMAIL) return;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <div style="background:#dc2626;padding:20px;color:white;">
        <h2 style="margin:0;">Energy Monitor Alert</h2>
        <p style="margin:4px 0 0;opacity:0.9;">${alert.severity} Severity</p>
      </div>
      <div style="padding:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#666;">Alert Type</td><td style="font-weight:600;">${alert.type}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Message</td><td>${alert.message}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Device</td><td>${alert.deviceId}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Time</td><td>${new Date(alert.timestamp).toLocaleString()}</td></tr>
        </table>
      </div>
    </div>`;
  try {
    await transporter.sendMail({
      from: `Smart Energy Monitor <${process.env.GMAIL_USER}>`,
      to:   process.env.ALERT_EMAIL,
      subject: `[${alert.severity}] ${alert.type} Alert`,
      html,
    });
    console.log(`Email alert sent: ${alert.type}`);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

async function sendSmsAlert(alert) {
  if (!shouldNotify(`sms_${alert.type}`)) return;
  if (!process.env.ALERT_PHONE) return;
  try {
    await twilioClient.messages.create({
      body: `ALERT [${alert.type}]: ${alert.message} | ${new Date(alert.timestamp).toLocaleTimeString()}`,
      from: process.env.TWILIO_PHONE,
      to:   process.env.ALERT_PHONE,
    });
    console.log(`SMS alert sent: ${alert.type}`);
  } catch (err) {
    console.error('SMS send failed:', err.message);
  }
}

module.exports = { sendEmailAlert, sendSmsAlert };
