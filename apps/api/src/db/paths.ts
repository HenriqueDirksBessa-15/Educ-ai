import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findRepositoryRoot(from = process.cwd()): string {
  let current = resolve(from);

  while (true) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
        name?: string;
        workspaces?: unknown;
      };
      if (packageJson.name === "educai" && packageJson.workspaces)
        return current;
    }

    const parent = dirname(current);
    if (parent === current)
      throw new Error("Não foi possível localizar a raiz do repositório.");
    current = parent;
  }
}
