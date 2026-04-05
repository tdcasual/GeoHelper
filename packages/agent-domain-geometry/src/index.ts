import {
  createGeometryPlatformBootstrap,
  type GeometryPlatformBootstrap
} from "./platform-bootstrap";

export type GeometryDomainPackage = GeometryPlatformBootstrap;

export const createGeometryDomainPackage = (): GeometryDomainPackage =>
  createGeometryPlatformBootstrap();

export * from "./agents/geometry-solver";
export * from "./evals/teacher-readiness";
export * from "./platform-bootstrap";
export * from "./run-profiles";
export * from "./tools/scene-apply-command-batch";
export * from "./tools/scene-read-state";
export * from "./workflows/geometry-solver-workflow";

export const packageName = "@geohelper/agent-domain-geometry";
