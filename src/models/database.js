const sqlite3 = require("sqlite3").verbose();
const path = require("path");

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, "../../paas.db"));
    this.init();
  }

  init() {
    // Users table
    this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'active'
            )
        `);

    // Pods table
    this.db.run(`
            CREATE TABLE IF NOT EXISTS pods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                pod_name TEXT NOT NULL,
                plan_type TEXT NOT NULL CHECK(plan_type IN ('basic', 'pro')),
                node_port INTEGER UNIQUE NOT NULL,
                status TEXT DEFAULT 'creating',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        `);

    console.log("Database initialized");
  }

  // User methods
  createUser(userId, email) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO users (user_id, email) VALUES (?, ?)",
        [userId, email],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM users WHERE user_id = ?",
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Pod methods
  createPod(userId, podName, planType, nodePort) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO pods (user_id, pod_name, plan_type, node_port) VALUES (?, ?, ?, ?)",
        [userId, podName, planType, nodePort],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  updatePodStatus(podId, status) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE pods SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, podId],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  getUserPods(userId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM pods WHERE user_id = ? ORDER BY created_at DESC",
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  getAllPods() {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM pods ORDER BY created_at DESC",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  deletePod(podId) {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM pods WHERE id = ?", [podId], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Port management
  getUsedPorts() {
    return new Promise((resolve, reject) => {
      this.db.all("SELECT node_port FROM pods", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map((row) => row.node_port));
      });
    });
  }
}

module.exports = new Database();
