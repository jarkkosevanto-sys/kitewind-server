require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const { getWindForSpot } = require('./wind');
const { sendWindAlert } = require('./notifications');
const { getAllSpots, addSpot, registerUser, getAllUsers, getLastNotified, setLastNotified } = require('./store');

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
    const goodSpotIds = goodSpots.map(s => s.spotId).sort();

    // get what we notified last time
    const lastNotified = getLastNotified(user.id);
    const lastSpotIds = [...(lastNotified.spotIds || [])].sort();

    // find NEW spots that weren't on last hour
    const newSpots = goodSpots.filter(s => !lastNotified.spotIds.includes(s.spotId));

    if (newSpots.length > 0) {
      console.log(`New spots for user ${user.id}: ${newSpots.map(s => `${s.spotName} ${s.currentSpeed}kt`).join(', ')}`);
      await sendWindAlert([user.pushToken], newSpots, user.threshold);
    } else if (goodSpots.length > 0) {
      console.log(`User ${user.id}: same spots still on, skipping notification`);
    } else {
      console.log(`User ${user.id}: no spots above ${user.threshold}kt threshold`);
    }

    // always update last notified state
    setLastNotified(user.id, goodSpotIds);
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

app.get('/compare', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const results = {};

  try {
    const iconUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=windspeed_10m&wind_speed_unit=kn&timezone=America%2FLos_Angeles&forecast_days=1&models=icon_seamless`;
    const iconData = await axios.get(iconUrl);
    const now = new Date().getHours();
    const times = iconData.data.hourly.time;
    const idx = times.findIndex(t => parseInt(t.slice(11,13)) === now);
    results.icon = Math.round(iconData.data.hourly.windspeed_10m[idx]);
  } catch(e) { results.icon = e.message; }

  try {
    const gfsUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=windspeed_10m&wind_speed_unit=kn&timezone=America%2FLos_Angeles&forecast_days=1`;
    const gfsData = await axios.get(gfsUrl);
    const now = new Date().getHours();
    const times = gfsData.data.hourly.time;
    const idx = times.findIndex(t => parseInt(t.slice(11,13)) === now);
    results.gfs = Math.round(gfsData.data.hourly.windspeed_10m[idx]);
  } catch(e) { results.gfs = e.message; }

  try {
    const ecmwfUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=windspeed_10m&wind_speed_unit=kn&timezone=America%2FLos_Angeles&forecast_days=1&models=ecmwf_ifs025`;
    const ecmwfData = await axios.get(ecmwfUrl);
    const now = new Date().getHours();
    const times = ecmwfData.data.hourly.time;
    const idx = times.findIndex(t => parseInt(t.slice(11,13)) === now);
    results.ecmwf = Math.round(ecmwfData.data.hourly.windspeed_10m[idx]);
  } catch(e) { results.ecmwf = e.message; }

  try {
    const ndbcId = req.query.ndbc;
    if (ndbcId) {
      const ndbcData = await axios.get(`https://www.ndbc.noaa.gov/data/realtime2/${ndbcId}.txt`);
      const lines = ndbcData.data.trim().split('\n');
      const parts = lines[2].split(/\s+/);
      const wspd = parts[6];
      results.ndbc = wspd !== 'MM' ? Math.round(parseFloat(wspd) * 1.944) : null;
    }
  } catch(e) { results.ndbc = e.message; }

  try {
    const nwsId = req.query.nws;
    if (nwsId) {
      const nwsData = await axios.get(`https://api.weather.gov/stations/${nwsId}/observations/latest`);
      const ws = nwsData.data.properties?.windSpeed?.value;
      results.nws = ws != null ? Math.round(ws * 0.5396) : null;
    }
  } catch(e) { results.nws = e.message; }

  res.json(results);
});

app.listen(PORT, () => {
  console.log(`KiteWind server running on port ${PORT}`);
  console.log('Cron: hourly wind check + 7am morning check scheduled');
});
