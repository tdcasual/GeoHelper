import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { runMigrations } from "./storage/migrate";
import "./styles.css";

const bootstrap = async (): Promise<void> => {
  await runMigrations();
  const { App } = await import("./App");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

void bootstrap();
