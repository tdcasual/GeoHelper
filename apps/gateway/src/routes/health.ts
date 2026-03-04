import { FastifyInstance } from "fastify";

export const registerHealthRoute = (app: FastifyInstance): void => {
  app.get("/api/v1/health", async () => ({
    status: "ok",
    time: new Date().toISOString()
  }));
};
