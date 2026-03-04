/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    GGBApplet?: new (
      parameters: Record<string, unknown>,
      autoStart: boolean
    ) => {
      inject: (containerId: string) => void;
      getAppletObject?: () => unknown;
    };
  }
}

export {};
