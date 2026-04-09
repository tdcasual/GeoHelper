import type { DelegationSessionRecord } from "@geohelper/agent-store";

export interface DelegationSessionPresentation {
  heading: string;
  target: string;
}

export const presentDelegationSession = (
  session: DelegationSessionRecord
): DelegationSessionPresentation => {
  const isHostService =
    typeof session.serviceRef === "string" &&
    session.serviceRef.length > 0 &&
    session.agentRef.length === 0;

  if (isHostService) {
    return {
      heading: "Host Service",
      target: session.serviceRef!
    };
  }

  return {
    heading: "ACP Agent",
    target: session.agentRef || "unresolved-agent"
  };
};
