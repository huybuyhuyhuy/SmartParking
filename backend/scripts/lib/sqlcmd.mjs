import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(__dirname, "..", "..");
export const sqlRoot = path.join(backendRoot, "Data", "sqlserver");

const server = process.env.DB_SERVER || "localhost";
const port = Number(process.env.DB_PORT || 1433);
export const database = process.env.DB_DATABASE || "SmartParking";
export const appLogin = process.env.DB_USER || "smartparking_app";
export const appPassword = process.env.DB_PASSWORD;
export const sqlcmdServer = server.includes("\\") ? server : `tcp:${server},${port}`;

export function assertSqlBootstrapConfig() {
  if (!appPassword) throw new Error("DB_PASSWORD is required for database SQL scripts");
}

export function runSqlFile(file) {
  assertSqlBootstrapConfig();
  return new Promise((resolve, reject) => {
    execFile(
      "sqlcmd",
      [
        "-S", sqlcmdServer,
        "-E",
        "-b",
        "-f", "65001",
        "-i", file,
        "-v",
        `DbName=${database}`,
        `AppLogin=${appLogin}`,
        `AppPassword=${appPassword}`
      ],
      { cwd: backendRoot },
      (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        err ? reject(err) : resolve();
      }
    );
  });
}
