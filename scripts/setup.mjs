import { copyFile } from "node:fs/promises";
import { constants } from "node:fs";

try {
  await copyFile(".env.example", ".env.local", constants.COPYFILE_EXCL);
  console.log("Created .env.local. Fill in your keys; see docs/TEAM_SETUP.md.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".env.local already exists; kept your configuration.");
}
