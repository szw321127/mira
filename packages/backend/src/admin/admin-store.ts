import { Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdminStoreData } from "./admin.types.js";

const storeDir = dirname(fileURLToPath(import.meta.url));
const defaultStorePath = resolve(storeDir, "../../.admin-store.json");

@Injectable()
export class AdminStore {
  private readonly storePath = process.env.ADMIN_STORE_PATH ?? defaultStorePath;

  async read(): Promise<AdminStoreData> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {};
      }

      throw error;
    }
  }

  async write(data: AdminStoreData): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}
