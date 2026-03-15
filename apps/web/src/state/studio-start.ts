export type StudioStartMode = "image" | "text" | "continue";

export interface StudioStartAction {
  mode: StudioStartMode;
  label: string;
  description: string;
}

export interface TeacherScenarioSeed {
  id: string;
  title: string;
  summary: string;
  inputMode: Extract<StudioStartMode, "image" | "text">;
  seedPrompt: string;
}

export interface StudioStartCopy {
  title: string;
  subtitle: string;
  primaryActionLabel: string;
}

export const STUDIO_START_ACTIONS: StudioStartAction[] = [
  {
    mode: "image",
    label: "看图生成",
    description: "上传或粘贴题目截图，快速还原可编辑图形。"
  },
  {
    mode: "text",
    label: "文字生成",
    description: "输入题干或作图要求，快速起稿。"
  },
  {
    mode: "continue",
    label: "继续编辑",
    description: "从最近图稿继续补图、修图和讲题。"
  }
];

export const TEACHER_SCENARIO_SEEDS: TeacherScenarioSeed[] = [
  {
    id: "seed_triangle_relation",
    title: "截图题还原关系图",
    summary: "把试卷截图里的三角形关系快速还原成可拖拽图。",
    inputMode: "image",
    seedPrompt: "识别题图中的点、线、角关系，并还原为可编辑几何图形。"
  },
  {
    id: "seed_text_geometry",
    title: "文字题自动起稿",
    summary: "根据题干先生成课堂可讲的标准图稿。",
    inputMode: "text",
    seedPrompt: "根据题干建立基础图形，并保留后续补点、补线的编辑空间。"
  },
  {
    id: "seed_sketch_to_demo",
    title: "草图转课堂演示图",
    summary: "把手画草图或截图整理成清晰、适合投屏的动态图。",
    inputMode: "image",
    seedPrompt: "参考草图结构，生成适合课堂演示的清晰几何图形。"
  }
];

export const resolveStudioStartCopy = (): StudioStartCopy => ({
  title: "把题目变成可编辑几何图",
  subtitle: "适合备课、讲题、改题，生成后可继续拖拽与标注。",
  primaryActionLabel: "开始生成图形"
});
