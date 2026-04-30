const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');
const SPOTS_PATH = path.join(__dirname, 'spots.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { users: {} };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// SPOTS
function getAllSpots() {
  const spots = JSON.parse(fs.readFileSync(SPOTS_PATH, 'utf8'));
  return spots.filter(s => s.approved);
}

function addSpot({ name, lat, lng, region, description, createdBy }) {
  const spots = JSON.parse(fs.readFileSync(SPOTS_PATH, 'utf8'));
  const newSpot = {
    id: `u_${Date.now()}`,
    name,
    lat,
    lng,
    region: region || 'User Added',
    description: description || '',
    approved: true, // auto-approve for now
    createdBy: createdBy || 'anonymous',
    createdAt: new Date().toISOString(),
  };
  spots.push(newSpot);
  fs.writeFileSync(SPOTS_PATH, JSON.stringify(spots, null, 2));
  console.log(`New spot added: ${name} by ${createdBy}`);
  return newSpot;
}

// USERS
function registerUser(userId, { pushToken, threshold, spotIds }) {
  const db = readDB();
  db.users[userId] = {
    pushToken,
    threshold: threshold || 10,
    spotIds: spotIds || [],
    updatedAt: new Date().toISOString(),
  };
  writeDB(db);
  console.log(`Registered user ${userId} with ${spotIds.length} spots, threshold ${threshold}kt`);
}

function getAllUsers() {
  const db = readDB();
  return Object.entries(db.users).map(([id, data]) => ({ id, ...data }));
}

function getLastNotified(userId) {
  const db = readDB();
  return db.users[userId]?.lastNotified || { spotIds: [], time: null };
}

function setLastNotified(userId, spotIds) {
  const db = readDB();
  if (db.users[userId]) {
    db.users[userId].lastNotified = {
      spotIds,
      time: new Date().toISOString(),
    };
    writeDB(db);
  }
}

module.exports = { getAllSpots, addSpot, registerUser, getAllUsers, getLastNotified, setLastNotified };

