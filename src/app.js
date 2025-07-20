const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const podRoutes = require("./routes/podRoutes");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/v1", podRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "PaaS N8N API Server",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      createPod: "POST /api/v1/pods",
      getAllPods: "GET /api/v1/pods",
      getUserPods: "GET /api/v1/pods/user/:userId",
      deletePod: "DELETE /api/v1/pods/:podId",
      clusterStatus: "GET /api/v1/cluster/status",
    },
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error);
  res.status(error.status || 500).json({
    error: error.message || "Internal server error",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    method: req.method,
  });
});

module.exports = app;
