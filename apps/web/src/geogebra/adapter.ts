export interface GeoGebraAdapter {
  evalCommand: (command: string) => void;
  setValue: (name: string, value: number) => void;
  getXML?: () => string | null;
  setXML?: (xml: string) => void;
  focusObjects?: (objectLabels: string[]) => boolean;
  clearFocusedObjects?: () => void;
}

export const createNoopAdapter = (): GeoGebraAdapter => ({
  evalCommand: () => undefined,
  setValue: () => undefined,
  getXML: () => null,
  setXML: () => undefined,
  focusObjects: () => false,
  clearFocusedObjects: () => undefined
});

let runtimeAdapter: GeoGebraAdapter = createNoopAdapter();

export const registerGeoGebraAdapter = (
  adapter: GeoGebraAdapter | null
): void => {
  runtimeAdapter = adapter ?? createNoopAdapter();
};

export const getGeoGebraAdapter = (): GeoGebraAdapter => runtimeAdapter;
