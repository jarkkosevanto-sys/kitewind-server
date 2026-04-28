require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { getWindForSpot } = require('./wind');
const { sendWindAlert } = require('./notifications');
const { getAllSpots, addSpot, registerUser, getAllUsers } = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// health check
app.get('/', (req, res) => {
  res.json({ status: 'KiteWind server running', time: new Date().toISOString() });
});

// get all approved spots
app.get('/spots', (req, res) => {
  try {
    const spots = getAllSpots();
    res.json(spots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// submit a new spot
app.post('/spots', (req, res) => {
  const { name, lat, lng, region, description, createdBy } = req.body;
  if (!name || !lat || !lng) {
    return res.status(400).json({ error: 'name, lat and lng are required' });
  }
  try {
    const spot = addSpot({ name, lat, lng, region, description, createdBy });
    res.json({ success: true, spot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// register device
app.post('/register', (req, res) => {
  const { userId, pushToken, threshold, spotIds } = req.body;
  if (!userId || !pushToken) {
    return res.status(400).json({ error: 'userId and pushToken required' });
  }
  registerUser(userId, { pushToken, threshold, spotIds });
  res.json({ success: true });
});

// manual wind check for testing
app.get('/check-wind', async (req, res) => {
  try {
    await checkWindAndNotify();
    res.json({ success: true, message: 'Wind check complete' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// core wind check
async function checkWindAndNotify() {
  const users = getAllUsers();
  if (users.length === 0) {
    console.log('No registered users, skipping wind check');
    return;
  }

  console.log(`Checking wind for ${users.length} users at ${new Date().toISOString()}`);

  const allSpots = getAllSpots();
  const allSpotIds = [...new Set(users.flatMap(u => u.spotIds))];
  const spotsToCheck = allSpots.filter(s => allSpotIds.includes(s.id));

  if (spotsToCheck.length === 0) return;

  const windResults = await Promise.all(spotsToCheck.map(getWindForSpot));
  const windMap = {};
  windResults.forEach(w => { windMap[w.spotId] = w; });

  for (const user of users) {
    if (!user.pushToken) continue;

    const userSpots = user.spotIds
      .map(id => windMap[id])
      .filter(Boolean);

    const goodSpots = userSpots.filter(w => w.currentSpeed >= user.threshold);

    if (goodSpots.length > 0) {
      console.log(`Notifying user ${user.id}: ${goodSpots.map(s => `${s.spotName} ${s.currentSpeed}kt`).join(', ')}`);
      await sendWindAlert([user.pushToken], goodSpots, user.threshold);
    } else {
      console.log(`User ${user.id}: no spots above ${user.threshold}kt threshold`);
    }
  }
}

// hourly wind check
cron.schedule('0 * * * *', () => {
  console.log('Hourly wind check triggered');
  checkWindAndNotify().catch(console.error);
});

// 7am morning check
cron.schedule('0 7 * * *', () => {
  console.log('Morning forecast check triggered');
  checkWindAndNotify().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`KiteWind server running on port ${PORT}`);
  console.log('Cron: hourly wind check + 7am morning check scheduled');
});
