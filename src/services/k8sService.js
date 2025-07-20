const k8s = require("@kubernetes/client-node");
const fs = require("fs");
const path = require("path");

class K8sService {
  constructor() {
    this.kc = new k8s.KubeConfig();

    try {
      // Try to load from standard location first
      this.kc.loadFromFile(process.env.HOME + "/.kube/config");
      console.log("Loaded kubeconfig from ~/.kube/config");
    } catch (error) {
      console.log("Failed to load from ~/.kube/config, trying default...");
      this.kc.loadFromDefault();
    }

    // Debug: show current config
    const cluster = this.kc.getCurrentCluster();
    const currentContext = this.kc.getCurrentContext();
    console.log("Current context:", currentContext);
    console.log("Current cluster server:", cluster?.server);

    // Fix for K3s TLS issue
    if (cluster) {
      cluster.skipTLSVerify = true;
      console.log("Set skipTLSVerify=true for cluster:", cluster.name);
    }

    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);

    this.namespace = "user-pods";

    console.log("K8s client initialized successfully");
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
      console.log("PVC created, now creating deployment...");

      // Load and parse pod template
      const podYaml = this.loadTemplate(planType, userId, nodePort);
      const manifests = this.parseYaml(podYaml);

      const deployment = manifests[0];
      const service = manifests[1];

      // Ensure namespace is set in metadata
      if (!deployment.metadata) deployment.metadata = {};
      if (!service.metadata) service.metadata = {};

      deployment.metadata.namespace = this.namespace;
      service.metadata.namespace = this.namespace;

      console.log(
        "Creating deployment with explicit parameters for namespace:",
        this.namespace
      );

      // Use same explicit parameter format as PVC
      const deploymentResult = await this.appsV1Api.createNamespacedDeployment({
        namespace: this.namespace,
        body: deployment,
      });

      console.log("Deployment created, now creating service...");

      const serviceResult = await this.coreV1Api.createNamespacedService({
        namespace: this.namespace,
        body: service,
      });

      console.log("Pod and service created successfully");

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
      console.log("Getting cluster resources...");

      const nodes = await this.coreV1Api.listNode();

      // Use explicit parameter format for listNamespacedPod
      const pods = await this.coreV1Api.listNamespacedPod({
        namespace: this.namespace,
      });

      console.log("Cluster resources retrieved successfully");

      return {
        nodes: nodes.body.items.length,
        totalPods: pods.body.items.length,
        runningPods: pods.body.items.filter(
          (pod) => pod.status.phase === "Running"
        ).length,
      };
    } catch (error) {
      console.error("Get cluster resources error:", error);
      throw new Error(`Failed to get cluster resources: ${error.message}`);
    }
  }
}

module.exports = new K8sService();
