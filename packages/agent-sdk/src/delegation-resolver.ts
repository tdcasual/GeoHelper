import type {
  LoadedPortableAgentBundle,
  PortableDelegationEntry
} from "@geohelper/agent-bundle";
import type { PlatformRunProfile } from "@geohelper/agent-protocol";

export type DelegationResolution =
  | {
      ok: true;
      value: PortableDelegationEntry;
    }
  | {
      ok: false;
      message: string;
    };

export const resolveBundleDelegation = (input: {
  bundle: LoadedPortableAgentBundle | null;
  delegationName: string | null;
  nodeId?: string;
}): DelegationResolution => {
  if (!input.delegationName) {
    return {
      ok: false,
      message: input.nodeId
        ? `Subagent node ${input.nodeId} is missing delegation`
        : "Subagent node is missing delegation"
    };
  }

  if (!input.bundle?.delegationConfig) {
    return {
      ok: false,
      message: `Bundle delegation config is unavailable for ${input.delegationName}`
    };
  }

  const entry = input.bundle.delegationConfig.delegations.find(
    (delegation) => delegation.name === input.delegationName
  );

  if (!entry) {
    return {
      ok: false,
      message: `Missing delegation config: ${input.delegationName}`
    };
  }

  return {
    ok: true,
    value: entry
  };
};

export type RunProfileResolution =
  | {
      ok: true;
      runProfileId: string;
    }
  | {
      ok: false;
      message: string;
    };

export const resolveDelegationRunProfileId = (input: {
  delegation: PortableDelegationEntry;
  runProfiles: Map<string, PlatformRunProfile>;
}): RunProfileResolution => {
  const agentRef = input.delegation.agentRef?.trim();

  if (!agentRef) {
    return {
      ok: false,
      message: `Delegation ${input.delegation.name} is missing agentRef`
    };
  }

  if (input.runProfiles.has(agentRef)) {
    return {
      ok: true,
      runProfileId: agentRef
    };
  }

  const matchingProfiles = [...input.runProfiles.values()].filter(
    (profile) => profile.agentId === agentRef
  );

  if (matchingProfiles.length === 1) {
    return {
      ok: true,
      runProfileId: matchingProfiles[0]!.id
    };
  }

  if (matchingProfiles.length > 1) {
    return {
      ok: false,
      message: `Delegation ${input.delegation.name} matched multiple run profiles for agentRef ${agentRef}`
    };
  }

  return {
    ok: false,
    message: `Delegation ${input.delegation.name} could not resolve run profile for agentRef ${agentRef}`
  };
};
