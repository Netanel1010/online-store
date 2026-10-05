import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const serverDir = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Runs a TypeScript file of the server as a real process and returns how it ended. The
 * environment is clean: nothing from the developer's shell or `.env` reaches it.
 */
export async function runTypeScript(
  file: string,
  env: Record<string, string>,
  args: string[] = [],
) {
  try {
    const { stdout, stderr } = await run(process.execPath, ['--import', 'tsx', file, ...args], {
      cwd: serverDir,
      env: { PATH: process.env.PATH ?? '', ...env },
      timeout: 20_000,
    })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}
