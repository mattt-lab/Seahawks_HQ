import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DATA_PATH = path.resolve(process.cwd(), "data/current.json");

export async function readCurrent() {
  try {
    return JSON.parse(await readFile(DATA_PATH, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeCurrent(data) {
  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
