import type { Checkpoint } from "@geohelper/agent-protocol";

interface CheckpointInboxProps {
  checkpoints: Checkpoint[];
}

export const CheckpointInbox = ({ checkpoints }: CheckpointInboxProps) => {
  const pendingCheckpoints = checkpoints.filter(
    (checkpoint) => checkpoint.status === "pending"
  );

  return (
    <section className="run-console-card" data-testid="checkpoint-inbox">
      <h3>Checkpoint Inbox</h3>
      {pendingCheckpoints.length > 0 ? (
        <ul>
          {pendingCheckpoints.map((checkpoint) => (
            <li key={checkpoint.id}>
              <strong>{checkpoint.title}</strong>
              <p>{checkpoint.prompt}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无待处理 checkpoint</p>
      )}
    </section>
  );
};
