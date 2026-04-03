export interface ToolRetryPolicy {
  maxAttempts: number;
}

export interface ToolRunnerPolicy {
  allowedPermissions: string[];
  retryPolicy?: ToolRetryPolicy;
}

export const ensureToolPermissions = (
  requiredPermissions: string[],
  allowedPermissions: string[]
): void => {
  const missing = requiredPermissions.filter(
    (permission) => !allowedPermissions.includes(permission)
  );
  if (missing.length > 0) {
    throw new Error("tool_permission_denied");
  }
};
