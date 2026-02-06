import fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

const BASE_DIR = path.join(os.homedir(), ".openclaw");

function resolvePath(relativePath: string): string {
  // Normalize and resolve the path
  // Handle empty path or root path
  const safeRelative = relativePath.replace(/^\/+/, "");
  const resolved = path.resolve(BASE_DIR, safeRelative);

  // Ensure the resolved path is within the base directory
  if (!resolved.startsWith(BASE_DIR)) {
    throw new Error("Access denied: Path is outside the allowed directory.");
  }

  return resolved;
}

export function createFilesHandlers(): GatewayRequestHandlers {
  return {
    "files.list": async ({ params, respond }) => {
      const p = params as { path: string };
      const relativePath = typeof p.path === "string" ? p.path : "";

      try {
        const fullPath = resolvePath(relativePath);

        // Check if directory exists
        try {
          await fs.access(fullPath);
        } catch {
          // If root doesn't exist, try to create it
          if (fullPath === BASE_DIR) {
            await fs.mkdir(BASE_DIR, { recursive: true });
          } else {
            throw new Error("Directory not found");
          }
        }

        const stats = await fs.stat(fullPath);

        if (!stats.isDirectory()) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "Path is not a directory"),
          );
          return;
        }

        const files = await fs.readdir(fullPath, { withFileTypes: true });

        const entries = files.map((file) => {
          const filePath = path.join(fullPath, file.name);
          const relativeFilePath = path.relative(BASE_DIR, filePath);

          return {
            name: file.name,
            path: relativeFilePath,
            type: file.isDirectory() ? "directory" : ("file" as const),
          };
        });

        // Sort directories first, then files
        entries.sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === "directory" ? -1 : 1;
        });

        respond(true, { entries, path: relativePath });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "files.read": async ({ params, respond }) => {
      const p = params as { path: string };
      if (typeof p.path !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing path"));
        return;
      }

      try {
        const fullPath = resolvePath(p.path);
        const content = await fs.readFile(fullPath, "utf-8");
        respond(true, { content, path: p.path, encoding: "utf-8" });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "files.write": async ({ params, respond }) => {
      const p = params as { path: string; content: string };
      if (typeof p.path !== "string" || typeof p.content !== "string") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "missing path or content"),
        );
        return;
      }

      try {
        const fullPath = resolvePath(p.path);
        await fs.writeFile(fullPath, p.content, "utf-8");
        respond(true, { ok: true, path: p.path });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "files.create": async ({ params, respond }) => {
      const p = params as { path: string; type: "file" | "directory" };
      if (typeof p.path !== "string" || !["file", "directory"].includes(p.type)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "missing path or invalid type"),
        );
        return;
      }

      try {
        const fullPath = resolvePath(p.path);
        if (p.type === "directory") {
          await fs.mkdir(fullPath, { recursive: true });
        } else {
          // Ensure parent dir exists
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          // Create empty file if it doesn't exist, fail if it does?
          // "wx" flag fails if path exists
          await fs.writeFile(fullPath, "", { flag: "wx" });
        }
        respond(true, { ok: true, path: p.path });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "files.delete": async ({ params, respond }) => {
      const p = params as { path: string };
      if (typeof p.path !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing path"));
        return;
      }

      try {
        const fullPath = resolvePath(p.path);
        await fs.rm(fullPath, { recursive: true, force: true });
        respond(true, { ok: true, path: p.path });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },

    "files.move": async ({ params, respond }) => {
      const p = params as { oldPath: string; newPath: string };
      if (typeof p.oldPath !== "string" || typeof p.newPath !== "string") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "missing oldPath or newPath"),
        );
        return;
      }

      try {
        const fullOldPath = resolvePath(p.oldPath);
        const fullNewPath = resolvePath(p.newPath);

        // Ensure parent of new path exists
        await fs.mkdir(path.dirname(fullNewPath), { recursive: true });

        await fs.rename(fullOldPath, fullNewPath);
        respond(true, { ok: true, oldPath: p.oldPath, newPath: p.newPath });
      } catch (err: unknown) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
        );
      }
    },
  };
}
