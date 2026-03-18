/**
 * SMART ENERGY MONITOR — Backend Server
 * Stack: Node.js + Express + MQTT + Socket.IO + JWT
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mqtt       = require('mqtt');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const morgan     = require('morgan');
require('dotenv').config();

const authRoutes   = require('./routes/auth');
const energyRoutes = require('./routes/energy');
const alertRoutes  = require('./routes/alerts');
const { authenticateToken } = require('./middleware/auth');

// ── Optional: Notifications (won't crash if not configured) ──
let sendEmailAlert = async () => {};
let sendSmsAlert   = async () => {};
try {
  const notif = require('./utils/notifications');
  sendEmailAlert = notif.sendEmailAlert;
  sendSmsAlert   = notif.sendSmsAlert;
} catch (e) {
  console.log('Notifications skipped — configure Gmail/Twilio in .env to enable');
}

// ── Optional: Firebase (won't crash if no service account) ──
let db = null;
try {
  const admin = require('firebase-admin');
  const sa    = require('./firebase-service-account.json');
  admin.initializeApp({
    credential:  admin.credential.cert(sa),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  db = admin.database();
  console.log('✅ Firebase connected');
} catch (e) {
  console.log('⚠️  Firebase skipped — add firebase-service-account.json to enable');
}

// ── App Setup ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', methods: ['GET','POST'] }
});
exports.db = db;
exports.io = io;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 200 }));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/energy', authenticateToken, energyRoutes);
app.use('/api/alerts', authenticateToken, alertRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── State ─────────────────────────────────────────────────
let latestReading = null;
let alertHistory  = [];

// ── MQTT ──────────────────────────────────────────────────
if (process.env.MQTT_BROKER) {
  const mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_BROKER}`, {
    port:               Number(process.env.MQTT_PORT) || 8883,
    username:           process.env.MQTT_USER,
    password:           process.env.MQTT_PASS,
    clientId:           `server_${Math.random().toString(16).slice(2,8)}`,
    rejectUnauthorized: false,
    reconnectPeriod:    5000,
  });

  mqttClient.on('connect', () => {
    console.log('✅ MQTT connected');
    mqttClient.subscribe(['home/energy/live', 'home/energy/alert']);
    console.log('📡 Subscribed to energy topics');
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      if (topic === 'home/energy/live') {
        latestReading = { ...payload, serverTs: Date.now() };
        io.emit('energy:live', latestReading);
        if (db) await db.ref(`devices/${payload.deviceId}/live`).set(latestReading);
      }
      if (topic === 'home/energy/alert') {
        const alert = { ...payload, id: `alert_${Date.now()}`, serverTs: Date.now() };
        alertHistory.unshift(alert);
        if (alertHistory.length > 100) alertHistory.pop();
        io.emit('energy:alert', alert);
        if (db) await db.ref(`devices/${payload.deviceId}/alerts`).push(alert);
        await sendEmailAlert(alert);
        await sendSmsAlert(alert);
      }
    } catch (err) {
      console.error('MQTT parse error:', err.message);
    }
  });

  mqttClient.on('error', err => console.error('MQTT error:', err.message));
} else {
  console.log('⚠️  MQTT skipped — add MQTT_BROKER to .env to enable');
}

// ── Extra REST ────────────────────────────────────────────
app.get('/api/energy/live',     authenticateToken, (req, res) => res.json(latestReading || {}));
app.get('/api/alerts/recent',   authenticateToken, (req, res) => res.json(alertHistory.slice(0,50)));
app.post('/api/device/command', authenticateToken, (req, res) => {
  const { action } = req.body;
  res.json({ success: true, action });
});

// ── WebSocket Auth ────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth required'));
  try {
    const jwt   = require('jsonwebtoken');
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', socket => {
  console.log(`🔌 Client connected: ${socket.id}`);
  if (latestReading) socket.emit('energy:live', latestReading);
  socket.on('disconnect', () => console.log(`🔌 Disconnected: ${socket.id}`));
});

// ── Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => res.status(500).json({ error: 'Server error' }));

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running → http://localhost:${PORT}`));
