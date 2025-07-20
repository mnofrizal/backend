const k8s = require("@kubernetes/client-node");
const fs = require("fs");
const path = require("path");

class K8sService {
  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();

    // Fix for K3s TLS issue - force skipTLSVerify
    const cluster = this.kc.getCurrentCluster();
    if (cluster) {
      cluster.skipTLSVerify = true;
      console.log("Set skipTLSVerify=true for cluster:", cluster.name);
    }

    // Also set it globally for the config
    const clusters = this.kc.getClusters();
    clusters.forEach((c) => {
      c.skipTLSVerify = true;
    });

    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);

    this.namespace = "user-pods";

    console.log("K8s client initialized with TLS verification disabled");
  }
  // Load and process templates
  loadTemplate(templateType, userId, nodePort) {
    const templatePath = path.join(
      __dirname,
      `../../templates/n8n-${templateType}-template.yaml`
    );
    let template = fs.readFileSync(templatePath, "utf8");

    // Replace placeholders
    template = template.replace(/USER_ID/g, userId);
    template = template.replace(/NODE_PORT/g, nodePort.toString());

    return template;
  }

  loadPvcTemplate(userId) {
    const templatePath = path.join(
      __dirname,
      "../../templates/pvc-template.yaml"
    );
    let template = fs.readFileSync(templatePath, "utf8");

    // Replace placeholders
    template = template.replace(/USER_ID/g, userId);

    return template;
  }

  // Parse YAML to JSON
  parseYaml(yamlContent) {
    const yaml = require("js-yaml");
    const docs = yaml.loadAll(yamlContent);
    return docs;
  }

  // Replace createPvc method with this fixed version
  async createPvc(userId) {
    try {
      console.log(
        "Creating PVC for user:",
        userId,
        "in namespace:",
        this.namespace
      );

      const pvcManifest = {
        apiVersion: "v1",
        kind: "PersistentVolumeClaim",
        metadata: {
          name: `${userId}-n8n-storage`,
          namespace: this.namespace,
        },
        spec: {
          accessModes: ["ReadWriteOnce"],
          storageClassName: "user-pod-storage",
          resources: {
            requests: {
              storage: "1Gi",
            },
          },
        },
      };

      console.log("Creating PVC with explicit parameters");

      // Use explicit parameter object instead of positional parameters
      const result = await this.coreV1Api.createNamespacedPersistentVolumeClaim(
        {
          namespace: this.namespace,
          body: pvcManifest,
        }
      );

      console.log("PVC created successfully");
      return result.body;
    } catch (error) {
      console.error("PVC creation error:", error);
      throw new Error(`Failed to create PVC: ${error.message}`);
    }
  }
  // Create pod deployment
  async createPod(userId, planType, nodePort) {
    try {
      // Create PVC first
      await this.createPvc(userId);

      // Load and parse pod template
      const podYaml = this.loadTemplate(planType, userId, nodePort);
      const manifests = this.parseYaml(podYaml);

      const deployment = manifests[0];
      const service = manifests[1];

      // Ensure namespace is set in metadata for both resources
      if (!deployment.metadata) deployment.metadata = {};
      if (!service.metadata) service.metadata = {};

      deployment.metadata.namespace = this.namespace;
      service.metadata.namespace = this.namespace;

      // Create deployment
      const deploymentResult = await this.appsV1Api.createNamespacedDeployment(
        this.namespace,
        deployment
      );

      // Create service
      const serviceResult = await this.coreV1Api.createNamespacedService(
        this.namespace,
        service
      );

      return {
        deployment: deploymentResult.body,
        service: serviceResult.body,
      };
    } catch (error) {
      console.error("Pod creation error:", error);
      throw new Error(`Failed to create pod: ${error.message}`);
    }
  }

  // Delete pod and related resources
  async deletePod(userId) {
    try {
      const deploymentName = `${userId}-n8n-basic`; // atau pro
      const serviceName = `${userId}-n8n-service`;
      const pvcName = `${userId}-n8n-storage`;

      // Delete deployment
      try {
        await this.appsV1Api.deleteNamespacedDeployment(
          deploymentName,
          this.namespace
        );
      } catch (err) {
        // Try pro deployment
        const proDeploymentName = `${userId}-n8n-pro`;
        await this.appsV1Api.deleteNamespacedDeployment(
          proDeploymentName,
          this.namespace
        );
      }

      // Delete service
      await this.coreV1Api.deleteNamespacedService(serviceName, this.namespace);

      // Delete PVC
      await this.coreV1Api.deleteNamespacedPersistentVolumeClaim(
        pvcName,
        this.namespace
      );

      return true;
    } catch (error) {
      throw new Error(`Failed to delete pod: ${error.message}`);
    }
  }

  // Get pod status
  async getPodStatus(userId) {
    try {
      const pods = await this.coreV1Api.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `user=${userId}`
      );

      return pods.body.items.map((pod) => ({
        name: pod.metadata.name,
        status: pod.status.phase,
        ready: pod.status.containerStatuses?.[0]?.ready || false,
        restartCount: pod.status.containerStatuses?.[0]?.restartCount || 0,
        created: pod.metadata.creationTimestamp,
      }));
    } catch (error) {
      throw new Error(`Failed to get pod status: ${error.message}`);
    }
  }

  // Get cluster resources
  async getClusterResources() {
    try {
      const nodes = await this.coreV1Api.listNode();
      const pods = await this.coreV1Api.listNamespacedPod(this.namespace);

      return {
        nodes: nodes.body.items.length,
        totalPods: pods.body.items.length,
        runningPods: pods.body.items.filter(
          (pod) => pod.status.phase === "Running"
        ).length,
      };
    } catch (error) {
      throw new Error(`Failed to get cluster resources: ${error.message}`);
    }
  }
}

module.exports = new K8sService();
