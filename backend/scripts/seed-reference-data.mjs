import path from "node:path";
import { runSqlFile, sqlRoot } from "./lib/sqlcmd.mjs";

await runSqlFile(path.join(sqlRoot, "seeds", "001_reference_data.sql"));
console.log("Reference data seed finished.");
