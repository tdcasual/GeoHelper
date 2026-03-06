export interface AppletHostSize {
  width: number;
  height: number;
}

export interface AppletPixelSize {
  width: number;
  height: number;
}

export const toAppletPixelSize = ({
  width,
  height
}: AppletHostSize): AppletPixelSize => {
  const safeWidth = Math.floor(width);
  const safeHeight = Math.floor(height);

  if (safeWidth <= 0 || safeHeight <= 0) {
    throw new Error("Invalid GeoGebra host size");
  }

  return {
    width: safeWidth,
    height: safeHeight
  };
};
