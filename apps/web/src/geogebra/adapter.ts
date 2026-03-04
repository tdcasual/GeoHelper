export interface GeoGebraAdapter {
  evalCommand: (command: string) => void;
  setValue: (name: string, value: number) => void;
}

export const createNoopAdapter = (): GeoGebraAdapter => ({
  evalCommand: () => undefined,
  setValue: () => undefined
});

let runtimeAdapter: GeoGebraAdapter = createNoopAdapter();

export const registerGeoGebraAdapter = (
  adapter: GeoGebraAdapter | null
): void => {
  runtimeAdapter = adapter ?? createNoopAdapter();
};

export const getGeoGebraAdapter = (): GeoGebraAdapter => runtimeAdapter;
