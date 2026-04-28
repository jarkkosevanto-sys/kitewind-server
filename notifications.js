const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPushNotification(expoPushToken, title, body) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    console.log('Invalid push token:', expoPushToken);
    return;
  }

  try {
    const response = await axios.post(EXPO_PUSH_URL, {
      to: expoPushToken,
      title,
      body,
      sound: 'default',
      priority: 'high',
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });
    console.log('Push sent:', response.data);
  } catch (error) {
    console.error('Push error:', error.message);
  }
}

async function sendWindAlert(tokens, goodSpots, threshold) {
  if (tokens.length === 0 || goodSpots.length === 0) return;

  let title, body;

  if (goodSpots.length === 1) {
    const s = goodSpots[0];
    title = `Wind is on at ${s.spotName} 🪁`;
    body = `${s.currentSpeed} kts — above your ${threshold} kt threshold. Gusting to ${s.currentGust} kt.`;
  } else {
    const best = goodSpots.reduce((a, b) => a.currentSpeed > b.currentSpeed ? a : b);
    const first = goodSpots.slice(0, 2).map(s => s.spotName).join(', ');
    const remainder = goodSpots.length - 2;
    const spotsText = remainder > 0
      ? `${first} and ${remainder} other spot${remainder > 1 ? 's' : ''}`
      : first;
    title = `Wind is on at ${goodSpots.length} spots 🪁`;
    body = `${spotsText}. Best: ${best.spotName} at ${best.currentSpeed} kts.`;
  }

  // send to all registered tokens
  await Promise.all(tokens.map(token => sendPushNotification(token, title, body)));
}

module.exports = { sendPushNotification, sendWindAlert };
