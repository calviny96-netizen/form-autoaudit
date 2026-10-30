import { cleanupFormFiles } from "../lib/form-file-cleanup";
import { pool } from "../lib/db";
async function main() {
  try {
    await cleanupFormFiles();
    console.log("Form file cleanup complete");
  } finally {
    await pool.end();
  }
}
void main();
