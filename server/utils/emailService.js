require('dotenv').config();
const nodemailer = require('nodemailer');
const logger = require('../logger');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  // Gmail's TLS handshake + auth + send routinely takes 4-8s from a cold
  // connection, so give the socket room before nodemailer gives up.
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 25000,
});

const verifyTransporter = async () => {
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    logger.error('SMTP verification failed', { error: err.message });
    return { ok: false, error: err.message };
  }
};

const sendMailWithTimeout = (transporter, mailOptions, timeoutMs = 10000) => {
  return Promise.race([
    transporter.sendMail(mailOptions),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`SMTP request timed out after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    }),
  ]);
};

// Alternative: Using a generic SMTP service
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   secure: true,
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASSWORD,
//   },
// });

const sendInviteEmail = async (recipientEmail, groupName, inviterName, inviteLink) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      throw new Error('EMAIL_USER and EMAIL_PASSWORD must be configured.');
    }

    const mailOptions = {
      from: process.env.EMAIL_USER || 'noreply@splitsmart.com',
      to: recipientEmail,
      subject: `${inviterName} invited you to join "${groupName}" on SplitSmart`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(145deg, #009B4D 0%, #007A3D 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0;">SplitSmart</h1>
            <p style="margin: 5px 0 0 0; font-size: 14px;">Expense Splitter</p>
          </div>
          
          <div style="padding: 30px; background: #f5f0e8; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1a1a1a; margin-top: 0;">You're invited to join a group! 🎉</h2>
            
            <p style="color: #333; line-height: 1.6;">
              <strong>${inviterName}</strong> has invited you to join the group <strong>"${groupName}"</strong> on SplitSmart to track and split expenses together.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #009B4D;">
              <p style="margin: 0; color: #666; font-size: 14px;">Click the button below to accept the invitation and sign up:</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${inviteLink}" style="
                background: #009B4D;
                color: white;
                padding: 14px 32px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
                font-size: 16px;
                display: inline-block;
              ">
                Accept Invite & Sign Up
              </a>
            </div>
            
            <p style="color: #666; font-size: 13px; margin-top: 25px;">
              Or copy and paste this link in your browser:<br/>
              <code style="background: #e8e8e8; padding: 8px; border-radius: 4px; word-break: break-all;">${inviteLink}</code>
            </p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
            
            <p style="color: #999; font-size: 12px; margin: 0;">
              If you didn't expect this invitation, you can safely ignore this email.<br/>
              © 2026 SplitSmart. All rights reserved.
            </p>
          </div>
        </div>
      `,
      text: `
        Hi!
        
        ${inviterName} has invited you to join the group "${groupName}" on SplitSmart.
        
        Click here to accept and sign up:
        ${inviteLink}
        
        Happy expense splitting!
        
        SplitSmart Team
      `,
    };

    console.log('[EMAIL] Calling SMTP sendMail...');
    let info;
    try {
      info = await sendMailWithTimeout(transporter, mailOptions, 25000);
    } catch (timeoutErr) {
      if (timeoutErr.message.includes('timed out')) {
        console.log('[EMAIL] SMTP TIMEOUT');
        throw new Error(`SMTP timeout: ${timeoutErr.message}`);
      }
      throw timeoutErr;
    }
    console.log('[EMAIL] SMTP sendMail completed');
    if (!info || !info.messageId) {
      throw new Error('SMTP sendMail did not return a messageId.');
    }

    logger.info(`Invite email sent to ${recipientEmail}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.log(`[EMAIL] SMTP error: ${err.message}`);
    logger.error('Failed to send invite email', {
      error: err.message,
      to: recipientEmail,
    });
    // Re-throw so callers (addMember) can detect the failure and fall back to
    // returning the invite link instead of falsely reporting success.
    throw err instanceof Error ? err : new Error(err.message || 'Failed to send invite email');
  }
};

module.exports = { sendInviteEmail };
