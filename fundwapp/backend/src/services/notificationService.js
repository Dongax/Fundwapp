const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('../config');
const { Notification } = require('../models');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: { user: config.smtp.user, pass: config.smtp.password },
  });
}

async function sendEmail({ user, fundraiser_id, event_type, to, subject, html }) {
  let delivered = false;
  try {
    if (transporter) {
      await transporter.sendMail({ from: config.smtp.from, to, subject, html });
      delivered = true;
    } else {
      console.log(`[email:${event_type}] to=${to} subject="${subject}"`);
    }
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  await Notification.create({
    user_id: user.id,
    fundraiser_id: fundraiser_id || null,
    channel: 'email',
    event_type,
    recipient: to,
    content: html,
    delivered,
    sent_at: delivered ? new Date() : null,
  });
}

// Uses Africa's Talking-style API as a reference SMS gateway integration.
async function sendSms({ user, fundraiser_id, event_type, to, message }) {
  let delivered = false;
  try {
    if (config.sms.apiKey) {
      await axios.post(
        'https://api.africastalking.com/version1/messaging',
        new URLSearchParams({ username: config.sms.username, to, message }),
        { headers: { apiKey: config.sms.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      delivered = true;
    } else {
      console.log(`[sms:${event_type}] to=${to} message="${message}"`);
    }
  } catch (err) {
    console.error('SMS send failed:', err.message);
  }

  await Notification.create({
    user_id: user.id,
    fundraiser_id: fundraiser_id || null,
    channel: 'sms',
    event_type,
    recipient: to,
    content: message,
    delivered,
    sent_at: delivered ? new Date() : null,
  });
}

async function sendOtp(user, otp) {
  return sendSms({
    user,
    event_type: 'otp',
    to: user.phone_number,
    message: `Your Fundwapp verification code is ${otp}. It expires in 10 minutes.`,
  });
}

async function notifyCampaignCreated(user, fundraiser) {
  return sendSms({
    user,
    fundraiser_id: fundraiser.id,
    event_type: 'campaign_created',
    to: user.phone_number,
    message: `Your fundraiser "${fundraiser.title}" has been created and is pending review.`,
  });
}

async function notifyContributionReceived(organizer, fundraiser, contribution) {
  return sendSms({
    user: organizer,
    fundraiser_id: fundraiser.id,
    event_type: 'contribution_received',
    to: organizer.phone_number,
    message: `Great news! ${contribution.contributor_name} contributed ${contribution.amount} ${fundraiser.currency} to "${fundraiser.title}".`,
  });
}

async function notifyWithdrawalCompleted(organizer, fundraiser, withdrawal) {
  return sendSms({
    user: organizer,
    fundraiser_id: fundraiser.id,
    event_type: 'withdrawal_completed',
    to: organizer.phone_number,
    message: `Your withdrawal of ${withdrawal.amount} ${fundraiser.currency} from "${fundraiser.title}" has been completed.`,
  });
}

module.exports = {
  sendEmail,
  sendSms,
  sendOtp,
  notifyCampaignCreated,
  notifyContributionReceived,
  notifyWithdrawalCompleted,
};
