const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const defectsRoutes = require('./routes/defects');
const analyticsRoutes = require('./routes/analytics');
const reportsRoutes = require('./routes/reports');
const dronesRoutes = require('./routes/drones');
const servicingRoutes = require('./routes/servicing');
const redisRoutes = require('./routes/redis');
const inspectionsRoutes = require('./routes/inspections');
const potholesRoutes = require('./routes/potholes');
const dashboardRoutes = require('./routes/dashboard');
const liveRoutes = require('./routes/live');
const costEstimatorRoutes = require('./routes/costEstimator');

const app = express();
const PORT = process.env.PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Dronacharya Backend API',
    timestamp: new Date().toISOString(),
    version: '3.0.0-production'
  });
});

// ─── Existing Routes (backward compatible) ────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/defects', defectsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/drones', dronesRoutes);
app.use('/api/servicing', servicingRoutes);
app.use('/api/redis', redisRoutes);

// ─── New RESTful Routes ───────────────────────────────────────────────────
app.use('/api/inspections', inspectionsRoutes);
app.use('/api/potholes', potholesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/live', liveRoutes);

// ─── Cost Estimator (deterministic engineering repair cost engine) ──────────
app.use('/api/cost-estimator', costEstimatorRoutes);

// Serve the final integrated frontend build (Rishi frontend) from frontend/dist.
const frontendBuild = path.join(__dirname, '../../frontend/dist');

console.log(`🌐 Serving frontend build from: ${frontendBuild}`);

app.use(express.static(frontendBuild));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendBuild, 'index.html'), (err) => {
    if (err) next();
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 [Dronacharya] Backend listening on http://localhost:${PORT}`);
  console.log(`🌐 Ready for frontend connections.`);
  console.log(`=================================================\n`);
});
