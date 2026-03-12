#!/usr/bin/env node
import { parseBackupEnvelope } from "../../packages/protocol/src/backup.ts";

const buildSteps = () => [
  {
    name: "read_latest_backup",
    method: "GET",
    path: "/admin/backups/latest"
  },
  {
    name: "validate_backup_envelope",
    helper: "parseBackupEnvelope",
    source: "backup.envelope"
  },
  {
    name: "report_restore_metadata",
    fields: [
      "stored_at",
      "schema_version",
      "created_at",
      "app_version",
      "conversation_count"
    ]
  }
];

const parseArgs = (argv) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }

    if (token === "--dry-run") {
      parsed["dry-run"] = true;
      continue;
    }

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
};

const normalizeBaseUrl = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.replace(/\/$/, "") : null;
};

const parseJsonText = (text) => {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const parseJsonEnv = (value, label) => {
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
};

const fetchJson = async (fetchImpl, url, options, label) => {
  const response = await fetchImpl(url, options);
  const body = parseJsonText(await response.text());

  if (!response.ok) {
    throw new Error(
      `${label} failed: ${response.status} ${JSON.stringify(body ?? null)}`
    );
  }

  return body;
};

const getAdminHeaders = (env) => ({
  "x-admin-token": env.ADMIN_METRICS_TOKEN
});

const readLatestBackup = async ({ gatewayUrl, env, fetchImpl }) => {
  if (env.GATEWAY_BACKUP_RESTORE_MOCK_RESPONSE_JSON) {
    return {
      gatewayUrl: null,
      body: parseJsonEnv(
        env.GATEWAY_BACKUP_RESTORE_MOCK_RESPONSE_JSON,
        "GATEWAY_BACKUP_RESTORE_MOCK_RESPONSE_JSON"
      )
    };
  }

  if (!gatewayUrl) {
    throw new Error(
      "GATEWAY_URL or --gateway-url is required for live restore drill"
    );
  }

  return {
    gatewayUrl,
    body: await fetchJson(
      fetchImpl,
      `${gatewayUrl}/admin/backups/latest`,
      {
        headers: getAdminHeaders(env)
      },
      "latest backup"
    )
  };
};

const summarizeRestoreDrill = (body) => {
  const backup = body?.backup;
  if (!backup || typeof backup !== "object") {
    throw new Error("latest backup failed: missing backup object");
  }

  const envelope = parseBackupEnvelope(backup.envelope);
  const storedAt = typeof backup.stored_at === "string" ? backup.stored_at : null;
  if (!storedAt) {
    throw new Error("latest backup failed: missing stored_at");
  }

  const conversationCount = envelope.conversations.length;
  if (
    typeof backup.conversation_count === "number" &&
    backup.conversation_count !== conversationCount
  ) {
    throw new Error("latest backup failed: conversation_count mismatch");
  }

  if (
    typeof backup.checksum === "string" &&
    backup.checksum !== envelope.checksum
  ) {
    throw new Error("latest backup failed: checksum mismatch");
  }

  return {
    stored_at: storedAt,
    schema_version: envelope.schema_version,
    created_at: envelope.created_at,
    app_version: envelope.app_version,
    conversation_count: conversationCount,
    checksum: envelope.checksum
  };
};

const printHelp = (stdout) => {
  stdout.write(
    [
      "Usage: node scripts/smoke/gateway-backup-restore.mjs [options]",
      "",
      "Options:",
      "  --dry-run                 Print restore drill steps without network calls",
      "  --gateway-url <url>       Gateway base URL (or GATEWAY_URL)",
      "  --help                    Show this help"
    ].join("\n") + "\n"
  );
};

export async function runGatewayBackupRestore({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout
} = {}) {
  const args = parseArgs(argv);
  const gatewayUrl = normalizeBaseUrl(args["gateway-url"] ?? env.GATEWAY_URL);

  if (args.help) {
    printHelp(stdout);
    return 0;
  }

  if (args["dry-run"]) {
    stdout.write(
      JSON.stringify(
        {
          dry_run: true,
          gateway_url: gatewayUrl,
          steps: buildSteps()
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  const latest = await readLatestBackup({
    gatewayUrl,
    env,
    fetchImpl
  });
  const restoreDrill = summarizeRestoreDrill(latest.body);

  stdout.write(
    JSON.stringify(
      {
        dry_run: false,
        gateway_url: latest.gatewayUrl,
        restore_drill: restoreDrill,
        build: latest.body?.build ?? null
      },
      null,
      2
    ) + "\n"
  );

  return 0;
}

const isMainModule = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === new URL(`file://${entry}`).href;
})();

if (isMainModule) {
  runGatewayBackupRestore().then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
