export interface GeoGebraAdapter {
  evalCommand: (command: string) => void;
  setValue: (name: string, value: number) => void;
}

export const createNoopAdapter = (): GeoGebraAdapter => ({
  evalCommand: () => undefined,
  setValue: () => undefined
});
