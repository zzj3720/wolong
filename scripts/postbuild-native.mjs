import { readdir, rename, rm, access, constants } from 'node:fs/promises';
import path from 'node:path';

const nativeDir = path.resolve(process.cwd(), 'native', 'core');
const targetName = 'wolong_core.node';

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const entries = await readdir(nativeDir);
  const candidates = entries
    .filter(name => name.startsWith('index') && name.endsWith('.node'))
    .sort((a, b) => a.length - b.length);

  if (candidates.length === 0) {
    console.warn('[native] No index*.node artifact found to rename.');
    return;
  }

  const sourceName = candidates[0];
  const sourcePath = path.join(nativeDir, sourceName);
  const targetPath = path.join(nativeDir, targetName);

  if (sourcePath === targetPath) {
    return;
  }

  // Try to remove target file first
  if (await fileExists(targetPath)) {
    try {
      await rm(targetPath, { force: true });
    } catch (error) {
      // If deletion fails (e.g., file is locked on Windows), rename it instead
      // Windows allows renaming files that are in use
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        const tempPath = path.join(nativeDir, `${targetName}.old.${Date.now()}`);
        try {
          await rename(targetPath, tempPath);
          // Try to delete the temp file, but don't fail if it's still locked
          rm(tempPath, { force: true }).catch(() => {
            // Ignore errors when deleting temp file
          });
        } catch (renameError) {
          // If rename also fails, we'll try to proceed anyway
          console.warn(`[native] Could not remove or rename existing ${targetName}, proceeding anyway`);
        }
      } else {
        throw error;
      }
    }
  }

  await rename(sourcePath, targetPath);
}

main().catch(error => {
  console.error('[native] Failed to prepare wolong_core.node', error);
  process.exitCode = 1;
});

