const axios = require('axios');

function degToCompass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

async function getWindForSpot(spot) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${spot.lat}&longitude=${spot.lng}` +
    `&hourly=windspeed_10m,winddirection_10m,windgusts_10m` +
    `&daily=windspeed_10m_max,windspeed_10m_min,winddirection_10m_dominant` +
    `&wind_speed_unit=kn` +
    `&timezone=America%2FLos_Angeles` +
    `&forecast_days=1`;

  const response = await axios.get(url);
  const json = response.data;

  const now = new Date();
  const currentHour = now.toISOString().slice(0, 13);
  const hourlyTimes = json.hourly.time;
  const idx = Math.max(0, hourlyTimes.findIndex(t => t.startsWith(currentHour)));

  return {
    spotId: spot.id,
    spotName: spot.name,
    currentSpeed: Math.round(json.hourly.windspeed_10m[idx]),
    currentDirection: json.hourly.winddirection_10m[idx],
    currentGust: Math.round(json.hourly.windgusts_10m[idx]),
  };
}

module.exports = { getWindForSpot, degToCompass };
