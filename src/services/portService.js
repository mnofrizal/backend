const db = require("../models/database");

class PortService {
  constructor() {
    this.portRangeStart = 31000;
    this.portRangeEnd = 32000;
  }

  // Get next available port
  async getNextAvailablePort() {
    try {
      const usedPorts = await db.getUsedPorts();

      for (let port = this.portRangeStart; port <= this.portRangeEnd; port++) {
        if (!usedPorts.includes(port)) {
          return port;
        }
      }

      throw new Error("No available ports in range");
    } catch (error) {
      throw new Error(`Port allocation failed: ${error.message}`);
    }
  }

  // Validate port range
  isValidPort(port) {
    return port >= this.portRangeStart && port <= this.portRangeEnd;
  }

  // Get port usage statistics
  async getPortStats() {
    try {
      const usedPorts = await db.getUsedPorts();
      const totalPorts = this.portRangeEnd - this.portRangeStart + 1;

      return {
        total: totalPorts,
        used: usedPorts.length,
        available: totalPorts - usedPorts.length,
        usedPorts: usedPorts.sort((a, b) => a - b),
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new PortService();
