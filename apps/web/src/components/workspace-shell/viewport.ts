export interface WorkspaceViewportInput {
  width: number;
  height: number;
}

export interface WorkspaceViewportState {
  compactViewport: boolean;
  phoneViewport: boolean;
  shortViewport: boolean;
}

export const resolveWorkspaceViewportState = ({
  width,
  height
}: WorkspaceViewportInput): WorkspaceViewportState => {
  const shortViewport = height <= 500;
  return {
    compactViewport: width <= 900 || shortViewport,
    phoneViewport: width <= 700,
    shortViewport
  };
};
