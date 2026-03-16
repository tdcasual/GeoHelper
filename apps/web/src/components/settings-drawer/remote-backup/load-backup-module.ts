export type BackupModule = typeof import("../../../storage/backup");

let backupModulePromise: Promise<BackupModule> | null = null;

export const loadBackupModule = (): Promise<BackupModule> => {
  if (!backupModulePromise) {
    backupModulePromise = import("../../../storage/backup");
  }

  return backupModulePromise;
};
