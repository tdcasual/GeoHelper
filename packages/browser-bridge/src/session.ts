import {
  BrowserToolRequestSchema,
  type BrowserToolRequest
} from "./commands";

export interface BrowserBridgeSession {
  id: string;
  enqueueRequest: (request: BrowserToolRequest) => void;
  takeNextRequest: () => BrowserToolRequest | null;
}

export interface CreateBrowserBridgeSessionOptions {
  id: string;
}

export const createBrowserBridgeSession = ({
  id
}: CreateBrowserBridgeSessionOptions): BrowserBridgeSession => {
  const queue: BrowserToolRequest[] = [];

  return {
    id,
    enqueueRequest: (request) => {
      queue.push(BrowserToolRequestSchema.parse(request));
    },
    takeNextRequest: () => queue.shift() ?? null
  };
};
