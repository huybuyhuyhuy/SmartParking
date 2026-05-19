import path from "node:path";
import { runSqlFile, sqlRoot } from "./lib/sqlcmd.mjs";

await runSqlFile(path.join(sqlRoot, "migrations", "001_schema.sql"));
console.log("Database migrations finished.");
