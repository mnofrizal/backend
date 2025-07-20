const express = require("express");
const router = express.Router();
const podController = require("../controllers/podController");

// Pod management routes
router.post("/pods", podController.createPod);
router.get("/pods", podController.getAllPods);
router.get("/pods/user/:userId", podController.getUserPods);
router.delete("/pods/:podId", podController.deletePod);

// Cluster status
router.get("/cluster/status", podController.getClusterStatus);

module.exports = router;
