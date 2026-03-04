export const STORAGE_SCHEMA_VERSION = 1;

export const runMigrations = async (): Promise<void> => {
  // Reserved for future schema migrations.
  return Promise.resolve();
};
