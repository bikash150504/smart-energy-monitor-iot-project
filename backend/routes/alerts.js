/**
 * Alerts Routes
 * GET /api/alerts/recent
 */
const express = require('express');
const router  = express.Router();

router.get('/recent', (req, res) => {
  res.json([]);
});

module.exports = router;
