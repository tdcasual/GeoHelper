import { useMemo, useState } from "react";

import { WorkspaceShell } from "./components/WorkspaceShell";
import {
  resolveStudioStartCopy,
  STUDIO_START_ACTIONS,
  TEACHER_SCENARIO_SEEDS,
  type StudioStartMode
} from "./state/studio-start";

const StudioHomepage = ({
  onEnterStudio,
  onOpenTemplateLibrary
}: {
  onEnterStudio: (mode: StudioStartMode) => void;
  onOpenTemplateLibrary: () => void;
}) => {
  const copy = useMemo(() => resolveStudioStartCopy(), []);
  const [selectedMode, setSelectedMode] = useState<StudioStartMode>("image");

  return (
    <main className="studio-homepage" data-testid="studio-homepage">
      <section className="studio-homepage-main">
        <div className="studio-homepage-copy">
          <p className="studio-homepage-eyebrow">GeoHelper · 教师制图台</p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>

        <div className="studio-start-actions" data-testid="studio-start-actions">
          {STUDIO_START_ACTIONS.map((action) => (
            <button
              key={action.mode}
              type="button"
              className={`studio-start-action${
                selectedMode === action.mode ? " studio-start-action-active" : ""
              }`}
              onClick={() => setSelectedMode(action.mode)}
            >
              <span>{action.label}</span>
              <small>{action.description}</small>
            </button>
          ))}
        </div>

        <div className="studio-homepage-inputs">
          <section
            className="studio-input-paper studio-input-paper-image"
            data-testid="studio-image-dropzone"
          >
            <strong>拖入题目截图</strong>
            <p>也可以直接粘贴图片，把纸面题、草图题快速转成可编辑图形。</p>
          </section>

          <section
            className="studio-input-paper studio-input-paper-text"
            data-testid="studio-text-entry"
          >
            <label htmlFor="studio-text-entry-input">输入题干或作图要求</label>
            <textarea
              id="studio-text-entry-input"
              rows={5}
              placeholder="例如：如图，已知 AB 是圆 O 的直径，点 C 在圆上，过点 C 作切线..."
              defaultValue=""
            />
          </section>
        </div>

        <div className="studio-homepage-actions">
          <button
            type="button"
            className="studio-primary-button"
            onClick={() => onEnterStudio(selectedMode)}
          >
            {copy.primaryActionLabel}
          </button>
          <button
            type="button"
            className="studio-secondary-button"
            onClick={() => onEnterStudio("continue")}
          >
            打开最近图稿
          </button>
          <button
            type="button"
            className="studio-secondary-button"
            onClick={onOpenTemplateLibrary}
          >
            进入模板库
          </button>
        </div>
      </section>

      <aside className="studio-homepage-scenarios">
        <p className="studio-homepage-side-label">教师真实场景</p>
        {TEACHER_SCENARIO_SEEDS.map((seed) => (
          <button
            key={seed.id}
            type="button"
            className="teacher-scenario-seed"
            data-testid="teacher-scenario-seed"
            onClick={() => onEnterStudio(seed.inputMode)}
          >
            <span>{seed.title}</span>
            <small>{seed.summary}</small>
          </button>
        ))}
      </aside>
    </main>
  );
};

export const App = () => {
  const [enteredStudio, setEnteredStudio] = useState(false);
  const [startMode, setStartMode] = useState<StudioStartMode>("image");
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);

  if (!enteredStudio) {
    return (
      <StudioHomepage
        onEnterStudio={(mode) => {
          setStartMode(mode);
          setTemplateLibraryOpen(false);
          setEnteredStudio(true);
        }}
        onOpenTemplateLibrary={() => {
          setStartMode("continue");
          setTemplateLibraryOpen(true);
          setEnteredStudio(true);
        }}
      />
    );
  }

  return (
    <WorkspaceShell
      initialDesktopInputMode={startMode}
      initialTemplateLibraryOpen={templateLibraryOpen}
      onTemplateLibraryOpenChange={setTemplateLibraryOpen}
    />
  );
};
