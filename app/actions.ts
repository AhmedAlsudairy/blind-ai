'use server';

import twilio from 'twilio';

export async function sendEmergencySMS(latitude: number | null, longitude: number | null) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const toNumber = process.env.EMERGENCY_CONTACT_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    console.error("Twilio credentials or emergency contact missing.");
    return { success: false, error: "Configuration missing" };
  }

  const client = twilio(accountSid, authToken);

  let messageBody = "🚨 FALL DETECTED! The user may need assistance.";
  if (latitude && longitude) {
    messageBody += `\n\nLocation: https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  try {
    const message = await client.messages.create({
      body: messageBody,
      from: fromNumber,
      to: toNumber,
    });
    console.log("Emergency SMS sent:", message.sid);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error("Failed to send SMS:", error);
    return { success: false, error: "Failed to send SMS" };
  }
}
