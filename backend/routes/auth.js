/**
 * Auth Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

const SALT_ROUNDS    = 12;
const ACCESS_EXPIRY  = '15m';
const REFRESH_EXPIRY = '7d';

const users             = new Map();
const refreshTokenStore = new Map();

function generateTokens(userId, email) {
  const accessToken = jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { userId, email },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
  return { accessToken, refreshToken };
}

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ error: 'All fields required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be 8+ characters' });
    if ([...users.values()].find(u => u.email === email))
      return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = `user_${Date.now()}`;
    users.set(userId, { id: userId, email, name, password: hashed, role: 'user' });

    const { accessToken, refreshToken } = generateTokens(userId, email);
    refreshTokenStore.set(refreshToken, userId);
    res.status(201).json({ accessToken, refreshToken, user: { id: userId, email, name } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const userData = [...users.values()].find(u => u.email === email);
    if (!userData)
      return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, userData.password);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    const { accessToken, refreshToken } = generateTokens(userData.id, email);
    refreshTokenStore.set(refreshToken, userData.id);
    res.json({ accessToken, refreshToken, user: { id: userData.id, email, name: userData.name, role: userData.role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// REFRESH
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken || !refreshTokenStore.has(refreshToken))
    return res.status(403).json({ error: 'Invalid refresh token' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.userId, decoded.email);
    refreshTokenStore.delete(refreshToken);
    refreshTokenStore.set(newRefresh, decoded.userId);
    res.json({ accessToken, refreshToken: newRefresh });
  } catch {
    res.status(403).json({ error: 'Refresh token expired' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) refreshTokenStore.delete(refreshToken);
  res.json({ message: 'Logged out' });
});

module.exports = router;
