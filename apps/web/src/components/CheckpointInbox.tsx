import type { Checkpoint } from "@geohelper/agent-protocol";

interface CheckpointInboxProps {
  checkpoints: Checkpoint[];
  onApproveCheckpoint?: (checkpoint: Checkpoint) => void;
  approvingCheckpointId?: string | null;
}

export const CheckpointInbox = ({
  checkpoints,
  onApproveCheckpoint,
  approvingCheckpointId = null
}: CheckpointInboxProps) => {
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
              {onApproveCheckpoint ? (
                <button
                  type="button"
                  className="run-console-inline-action"
                  disabled={approvingCheckpointId === checkpoint.id}
                  onClick={() => onApproveCheckpoint(checkpoint)}
                >
                  {approvingCheckpointId === checkpoint.id
                    ? "Approving..."
                    : "Approve checkpoint"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无待处理 checkpoint</p>
      )}
    </section>
  );
};
