import { CommandOp } from "@geohelper/protocol";

import { GeoGebraAdapter } from "./adapter";

type OpHandler = (args: Record<string, unknown>, adapter: GeoGebraAdapter) => void;

const asNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value));
const asString = (value: unknown): string => (typeof value === "string" ? value : String(value));

export const opHandlers: Record<CommandOp, OpHandler> = {
  create_point: (args, adapter) => {
    const name = asString(args.name ?? "A");
    const x = asNumber(args.x ?? 0);
    const y = asNumber(args.y ?? 0);
    adapter.evalCommand(`${name}=(${x},${y})`);
  },
  create_line: (args, adapter) => {
    const from = asString(args.from ?? "A");
    const to = asString(args.to ?? "B");
    adapter.evalCommand(`Line(${from},${to})`);
  },
  create_conic: (args, adapter) => {
    const center = asString(args.center ?? "A");
    const radius = asNumber(args.radius ?? 1);
    adapter.evalCommand(`Circle(${center},${radius})`);
  },
  set_property: (args, adapter) => {
    const name = asString(args.name ?? "a");
    const value = asNumber(args.value ?? 0);
    adapter.setValue(name, value);
  },
  create_slider: (args, adapter) => {
    const name = asString(args.name ?? "k");
    const min = asNumber(args.min ?? 0);
    const max = asNumber(args.max ?? 10);
    const step = asNumber(args.step ?? 1);
    adapter.evalCommand(`${name}=Slider(${min},${max},${step})`);
  },
  create_3d_object: (args, adapter) => {
    const expression = asString(args.expression ?? "");
    adapter.evalCommand(expression);
  },
  run_cas: (args, adapter) => {
    const expression = asString(args.expression ?? "");
    adapter.evalCommand(`CAS(${expression})`);
  },
  run_probability_tool: (args, adapter) => {
    const distribution = asString(args.distribution ?? "Normal");
    adapter.evalCommand(`ProbabilityCalculator(${distribution})`);
  }
};
