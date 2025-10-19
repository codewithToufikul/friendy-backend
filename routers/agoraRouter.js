import express from 'express';
import dotenv from 'dotenv';
import pkg from "agora-access-token";
const { RtcTokenBuilder, RtcRole, RtmTokenBuilder, RtmRole } = pkg;


dotenv.config();

const router = express.Router();

function getEnvOrThrow(key) {
  const v = process.env[key];
  if (!v) {
    throw new Error(`${key} is not set in environment`);
  }
  return v;
}

// Helper to parse body values safely
function parseBody(req) {
  const {
    channelName,
    uid,
    role = 'publisher',
    expireSeconds = 300,
  } = req.body || {};
  return {
    channelName,
    uid: String(uid ?? ''),
    role,
    expireSeconds: Number(expireSeconds) || 300,
  };
}

router.post('/rtcToken', (req, res) => {
  try {
    const { channelName, uid, role, expireSeconds } = parseBody(req);
    if (!channelName || !uid) {
      return res.status(400).json({ success: false, message: 'channelName and uid are required' });
    }

    const appId = getEnvOrThrow('AGORA_APP_ID');
    const appCertificate = getEnvOrThrow('AGORA_APP_CERTIFICATE');

    const agoraRole = role === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTs + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      Number(uid),
      agoraRole,
      privilegeExpiredTs
    );

    return res.json({ success: true, token, appId, channelName, uid: Number(uid), expireSeconds });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/rtmToken', (req, res) => {
  try {
    const { uid, expireSeconds } = parseBody(req);
    if (!uid) {
      return res.status(400).json({ success: false, message: 'uid is required' });
    }

    const appId = getEnvOrThrow('AGORA_APP_ID');
    const appCertificate = getEnvOrThrow('AGORA_APP_CERTIFICATE');

    const role = RtmRole.Rtm_User;
    const currentTs = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTs + expireSeconds;

    const token = RtmTokenBuilder.buildToken(
      appId,
      appCertificate,
      String(uid),
      role,
      privilegeExpiredTs
    );

    return res.json({ success: true, token, appId, uid: String(uid), expireSeconds });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
