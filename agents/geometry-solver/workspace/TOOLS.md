# Tool Guidance

- Use `scene.read_state` before proposing a write when current canvas state matters.
- Use `scene.apply_command_batch` only when the command batch is reviewable and consistent with the teaching goal.
