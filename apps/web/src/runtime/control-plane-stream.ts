import type { RunEvent } from "@geohelper/agent-protocol";
import type { RunSnapshot } from "@geohelper/agent-store";

interface SseFrame {
  event: string;
  data: unknown;
}

type PartialRunSnapshot = Pick<RunSnapshot, "run"> &
  Partial<Omit<RunSnapshot, "run">>;

const parseSseFrames = (payload: string): SseFrame[] =>
  payload
    .trim()
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const eventLine = block
        .split("\n")
        .find((line) => line.startsWith("event: "));
      const dataLine = block
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!eventLine || !dataLine) {
        throw new Error("invalid_run_stream_payload");
      }

      return {
        event: eventLine.slice(7),
        data: JSON.parse(dataLine.slice(6)) as unknown
      };
    });

const normalizeRunSnapshot = (snapshot: PartialRunSnapshot): RunSnapshot => ({
  run: snapshot.run,
  events: snapshot.events ?? [],
  checkpoints: snapshot.checkpoints ?? [],
  artifacts: snapshot.artifacts ?? [],
  childRuns: snapshot.childRuns ?? [],
  memoryEntries: snapshot.memoryEntries ?? []
});

const mergeRunEvents = (events: RunEvent[]): RunEvent[] =>
  [...new Map(events.map((event) => [event.sequence, event])).values()].sort(
    (left, right) => left.sequence - right.sequence
  );

export const parseRunStreamPayload = (payload: string): RunSnapshot => {
  const frames = parseSseFrames(payload);
  const snapshotFrame = frames.find((frame) => frame.event === "run.snapshot");

  if (!snapshotFrame) {
    throw new Error("invalid_run_stream_payload");
  }

  const snapshot = normalizeRunSnapshot(snapshotFrame.data as PartialRunSnapshot);
  const incrementalEvents = frames
    .filter((frame) => frame.event === "run.event")
    .map((frame) => frame.data as RunEvent);

  return {
    ...snapshot,
    events: mergeRunEvents([...snapshot.events, ...incrementalEvents])
  };
};

export const buildRunStreamUrl = ({
  baseUrl,
  path,
  afterSequence
}: {
  baseUrl: string;
  path: string;
  afterSequence?: number;
}): string => {
  const streamUrl = new URL(`${baseUrl}${path}`, "https://geohelper-control-plane.local");

  if (afterSequence !== undefined) {
    streamUrl.searchParams.set("afterSequence", String(afterSequence));
  }

  return baseUrl
    ? `${baseUrl}${streamUrl.pathname}${streamUrl.search}`
    : `${streamUrl.pathname}${streamUrl.search}`;
};
