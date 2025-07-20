const db = require("../models/database");
const k8sService = require("../services/k8sService");
const portService = require("../services/portService");
const { v4: uuidv4 } = require("uuid");

class PodController {
  // Create new pod
  async createPod(req, res) {
    try {
      const { planType, email } = req.body;

      // Validation
      if (!planType || !["basic", "pro"].includes(planType)) {
        return res.status(400).json({
          error: "Invalid plan type. Must be basic or pro",
        });
      }

      // Generate user ID
      const userId = `user-${uuidv4().substring(0, 8)}`;

      // Get available port
      const nodePort = await portService.getNextAvailablePort();

      // Create user in database
      await db.createUser(userId, email || "");

      // Create pod record in database
      const podName = `${userId}-n8n-${planType}`;
      const podId = await db.createPod(userId, podName, planType, nodePort);

      // Create pod in Kubernetes (async)
      k8sService
        .createPod(userId, planType, nodePort)
        .then(async () => {
          await db.updatePodStatus(podId, "running");
          console.log(`Pod created successfully for user: ${userId}`);
        })
        .catch(async (error) => {
          await db.updatePodStatus(podId, "failed");
          console.error(`Pod creation failed for user: ${userId}`, error);
        });

      res.status(201).json({
        success: true,
        message: "Pod creation initiated",
        data: {
          userId,
          podName,
          planType,
          nodePort,
          accessUrl: `http://192.168.31.152:${nodePort}`,
          status: "creating",
        },
      });
    } catch (error) {
      console.error("Create pod error:", error);
      res.status(500).json({
        error: "Failed to create pod",
        message: error.message,
      });
    }
  }

  // Get user pods
  async getUserPods(req, res) {
    try {
      const { userId } = req.params;

      const pods = await db.getUserPods(userId);

      // Get real-time status from Kubernetes
      let k8sStatus = [];
      try {
        k8sStatus = await k8sService.getPodStatus(userId);
      } catch (error) {
        console.log("Could not get K8s status:", error.message);
      }

      const enrichedPods = pods.map((pod) => ({
        ...pod,
        accessUrl: `http://192.168.31.152:${pod.node_port}`,
        k8sStatus: k8sStatus.find((k8s) => k8s.name.includes(pod.user_id)),
      }));

      res.json({
        success: true,
        data: enrichedPods,
      });
    } catch (error) {
      console.error("Get user pods error:", error);
      res.status(500).json({
        error: "Failed to get user pods",
        message: error.message,
      });
    }
  }

  // Get all pods (admin view)
  async getAllPods(req, res) {
    try {
      const pods = await db.getAllPods();

      const enrichedPods = pods.map((pod) => ({
        ...pod,
        accessUrl: `http://192.168.31.152:${pod.node_port}`,
      }));

      res.json({
        success: true,
        data: enrichedPods,
      });
    } catch (error) {
      console.error("Get all pods error:", error);
      res.status(500).json({
        error: "Failed to get pods",
        message: error.message,
      });
    }
  }

  // Delete pod
  async deletePod(req, res) {
    try {
      const { podId } = req.params;

      // Get pod info
      const pods = await db.getAllPods();
      const pod = pods.find((p) => p.id == podId);

      if (!pod) {
        return res.status(404).json({
          error: "Pod not found",
        });
      }

      // Delete from Kubernetes
      await k8sService.deletePod(pod.user_id);

      // Delete from database
      await db.deletePod(podId);

      res.json({
        success: true,
        message: "Pod deleted successfully",
      });
    } catch (error) {
      console.error("Delete pod error:", error);
      res.status(500).json({
        error: "Failed to delete pod",
        message: error.message,
      });
    }
  }

  // Get cluster status
  async getClusterStatus(req, res) {
    try {
      const clusterResources = await k8sService.getClusterResources();
      const portStats = await portService.getPortStats();

      res.json({
        success: true,
        data: {
          cluster: clusterResources,
          ports: portStats,
        },
      });
    } catch (error) {
      console.error("Get cluster status error:", error);
      res.status(500).json({
        error: "Failed to get cluster status",
        message: error.message,
      });
    }
  }
}

module.exports = new PodController();
