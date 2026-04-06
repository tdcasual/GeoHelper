import type { PlatformAgentDefinition } from "@geohelper/agent-protocol";

import type { DomainPackage } from "./domain-package";
import {
  createPlatformRegistry,
  type PlatformRegistry
} from "./platform-registry";

export const registerDomainPackage = <
  TAgentDefinition extends PlatformAgentDefinition = PlatformAgentDefinition,
  TToolDefinition = unknown,
  TEvaluator = unknown
>(
  registry: PlatformRegistry<TAgentDefinition, TToolDefinition, TEvaluator>,
  domainPackage: DomainPackage<TAgentDefinition, TToolDefinition, TEvaluator>
): PlatformRegistry<TAgentDefinition, TToolDefinition, TEvaluator> =>
  createPlatformRegistry({
    domainPackages: [...registry.domainPackages, domainPackage]
  });
