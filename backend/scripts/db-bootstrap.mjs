import path from "node:path";
import { runSqlFile, sqlRoot } from "./lib/sqlcmd.mjs";

await runSqlFile(path.join(sqlRoot, "000_bootstrap.sql"));
await runSqlFile(path.join(sqlRoot, "migrations", "001_schema.sql"));
await runSqlFile(path.join(sqlRoot, "seeds", "001_reference_data.sql"));
console.log("Database bootstrap finished.");
