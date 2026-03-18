/**
 * Energy Routes
 * GET /api/energy/history
 * GET /api/energy/stats
 * GET /api/energy/devices
 */
const express = require('express');
const router  = express.Router();

let energyHistory = [];

exports.addToHistory = (point) => {
  energyHistory.unshift(point);
  if (energyHistory.length > 2000) energyHistory.pop();
};

router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(energyHistory.slice(0, limit).reverse());
});

router.get('/stats', (req, res) => {
  if (!energyHistory.length) return res.json({});
  const powers   = energyHistory.map(r => r.power).filter(Boolean);
  const voltages = energyHistory.map(r => r.voltage).filter(Boolean);
  const temps    = energyHistory.map(r => r.temperature).filter(Boolean);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  res.json({
    powerAvg:       avg(powers).toFixed(1),
    powerMax:       Math.max(...powers).toFixed(1),
    voltageAvg:     avg(voltages).toFixed(1),
    tempAvg:        avg(temps).toFixed(1),
    readingsCount:  energyHistory.length,
    totalEnergyKwh: (energyHistory[0]?.energy || 0).toFixed(3),
  });
});

router.get('/devices', (req, res) => {
  res.json([{ id: 'ESP32_001', online: true, lastSeen: new Date().toISOString() }]);
});

module.exports = router;
