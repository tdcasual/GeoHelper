#!/usr/bin/env node

const usage = `Usage:
  delegation-executor-bridge.mjs claim-next <base-url> <executor-id> [--agent-ref <ref>] [--service-ref <ref>] [--ttl-seconds <n>]
  delegation-executor-bridge.mjs heartbeat <base-url> <session-id> <executor-id> [--ttl-seconds <n>]
  delegation-executor-bridge.mjs release <base-url> <session-id> <executor-id>
  delegation-executor-bridge.mjs submit-result <base-url> <session-id> <executor-id> --status <completed|failed> [--result-json <json>] [--artifacts-json <json>]`;

const fail = (message, details) => {
  console.error(message);

  if (details) {
    console.error(details);
  }

  process.exit(1);
};

const parseInteger = (value, flagName) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`Invalid ${flagName}: ${value}`);
  }

  return parsed;
};

const parseJson = (value, flagName) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    fail(`Invalid ${flagName}: ${(error && error.message) || "JSON parse error"}`);
  }
};

const parseFlags = (argv) => {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      fail(`Unexpected positional argument: ${token}`, usage);
    }

    const flagName = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      fail(`Missing value for --${flagName}`, usage);
    }

    flags[flagName] = value;
    index += 1;
  }

  return flags;
};

const buildUrl = (baseUrl, routePath) =>
  new URL(routePath.replace(/^\//, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();

const requestJson = async (baseUrl, routePath, payload) => {
  const response = await fetch(buildUrl(baseUrl, routePath), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw: text
      };
    }
  }

  if (!response.ok) {
    fail(
      `Request failed with status ${response.status} ${response.statusText}`,
      JSON.stringify(data, null, 2)
    );
  }

  process.stdout.write(`${JSON.stringify(data)}\n`);
};

const main = async () => {
  const command = process.argv[2];

  if (!command) {
    fail(usage);
  }

  const args = process.argv.slice(3);

  switch (command) {
    case "claim-next": {
      if (args.length < 2) {
        fail(usage);
      }

      const [baseUrl, executorId, ...flagArgs] = args;
      const flags = parseFlags(flagArgs);

      await requestJson(baseUrl, "/api/v3/delegation-sessions/claim", {
        executorId,
        ...(flags["agent-ref"] ? { agentRef: flags["agent-ref"] } : {}),
        ...(flags["service-ref"] ? { serviceRef: flags["service-ref"] } : {}),
        ...(flags["ttl-seconds"]
          ? { ttlSeconds: parseInteger(flags["ttl-seconds"], "--ttl-seconds") }
          : {})
      });
      break;
    }

    case "heartbeat": {
      if (args.length < 3) {
        fail(usage);
      }

      const [baseUrl, sessionId, executorId, ...flagArgs] = args;
      const flags = parseFlags(flagArgs);

      await requestJson(
        baseUrl,
        `/api/v3/delegation-sessions/${encodeURIComponent(sessionId)}/heartbeat`,
        {
          executorId,
          ...(flags["ttl-seconds"]
            ? { ttlSeconds: parseInteger(flags["ttl-seconds"], "--ttl-seconds") }
            : {})
        }
      );
      break;
    }

    case "release": {
      if (args.length !== 3) {
        fail(usage);
      }

      const [baseUrl, sessionId, executorId] = args;

      await requestJson(
        baseUrl,
        `/api/v3/delegation-sessions/${encodeURIComponent(sessionId)}/release`,
        {
          executorId
        }
      );
      break;
    }

    case "submit-result": {
      if (args.length < 3) {
        fail(usage);
      }

      const [baseUrl, sessionId, executorId, ...flagArgs] = args;
      const flags = parseFlags(flagArgs);

      if (!flags.status) {
        fail("Missing required flag --status", usage);
      }

      if (flags.status !== "completed" && flags.status !== "failed") {
        fail(`Invalid --status: ${flags.status}`);
      }

      const artifacts = flags["artifacts-json"]
        ? parseJson(flags["artifacts-json"], "--artifacts-json")
        : [];

      if (!Array.isArray(artifacts)) {
        fail("Invalid --artifacts-json: expected a JSON array");
      }

      await requestJson(
        baseUrl,
        `/api/v3/delegation-sessions/${encodeURIComponent(sessionId)}/result`,
        {
          executorId,
          status: flags.status,
          ...(flags["result-json"]
            ? { result: parseJson(flags["result-json"], "--result-json") }
            : {}),
          artifacts
        }
      );
      break;
    }

    default:
      fail(`Unknown command: ${command}`, usage);
  }
};

await main();
process.exit(0);
