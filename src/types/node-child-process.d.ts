// vite.config.ts runs `git` for the build stamp. @types/node isn't installed,
// so only the one call it makes is declared.
declare module "node:child_process" {
  export function execSync(command: string): { toString(): string };
}
