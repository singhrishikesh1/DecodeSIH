const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || "drone-inspector-secret-key-2026";

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email && password) {
    const token = jwt.sign(
      { email, role: "INSPECTOR", name: email.split('@')[0] || "Field Inspector" },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      token,
      user: {
        email,
        name: "Official Inspector",
        role: "INSPECTOR",
        department: "PWD & Infrastructure Monitoring"
      }
    });
  }

  return res.status(400).json({ success: false, message: "Invalid email or password" });
});

router.post('/register', (req, res) => {
  const { email, name, role } = req.body;
  const token = jwt.sign({ email, role: role || "INSPECTOR", name }, JWT_SECRET, { expiresIn: '24h' });
  return res.json({ success: true, token, user: { email, name, role: role || "INSPECTOR" } });
});

module.exports = router;
