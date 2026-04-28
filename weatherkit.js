const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const KEY_ID = process.env.WEATHERKIT_KEY_ID;
const TEAM_ID = process.env.WEATHERKIT_TEAM_ID;
const SERVICE_ID = process.env.WEATHERKIT_SERVICE_ID;
const KEY_PATH = process.env.WEATHERKIT_KEY_PATH;

function generateToken() {
  const privateKey = fs.readFileSync(path.resolve(KEY_PATH), 'utf8');

  const token = jwt.sign(
    {
      sub: SERVICE_ID,
    },
    privateKey,
    {
      algorithm: 'ES256',
      keyid: KEY_ID,
      issuer: TEAM_ID,
      expiresIn: '1h',
      header: {
        id: `${TEAM_ID}.${SERVICE_ID}`,
      },
    }
  );

  return token;
}

async function getWind(lat, lng) {
  const token = generateToken();

  const url = `https://weatherkit.apple.com/api/v1/weather/en-US/${lat}/${lng}?dataSets=currentWeather,hourlyForecast,dailyForecast&hourlyStart=${new Date().toISOString()}&hourlyEnd=${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WeatherKit error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // current conditions
  console.log('Raw current wind:', JSON.stringify(data.currentWeather, null, 2));
  console.log('Hourly count:', data.hourlyForecast?.hours?.length);
  console.log('Daily count:', data.dailyForecast?.days?.length);
  const current = data.currentWeather;
  const currentSpeed = msToKnots(current.windSpeed);
  const currentGust = msToKnots(current.windGust ?? current.windSpeed);
  const currentDirection = current.windDirection;
  const currentLow = Math.round(currentSpeed * 0.75);

  // hourly forecast — next 24 hours
  const hourly = (data.hourlyForecast?.hours ?? []).map(h => {
    const time = new Date(h.forecastStart);
    return {
      time: time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
      hour: time.getHours(),
      speed: msToKnots(h.windSpeed),
      direction: h.windDirection,
      gust: msToKnots(h.windGust ?? h.windSpeed),
      low: Math.round(msToKnots(h.windSpeed) * 0.75),
    };
  });

  // daily forecast — 5 days
  const daily = (data.dailyForecast?.days ?? []).slice(0, 5).map(d => {
    const date = new Date(d.forecastStart);
    const dayHours = hourly.filter(h => {
      const hDate = new Date();
      hDate.setHours(h.hour);
      return true;
    });

    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      maxSpeed: msToKnots(d.windSpeedMax ?? 0),
      minSpeed: msToKnots(d.windSpeedAvg ?? 0),
      direction: d.windDirection ?? 0,
      hours: [],
    };
  });

  return {
    currentSpeed,
    currentGust,
    currentDirection,
    currentLow,
    hourly,
    daily,
  };
}

function msToKnots(ms) {
  return Math.round(ms * 1.944);
}

module.exports = { getWind };
