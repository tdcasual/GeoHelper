import type { PromptTemplate } from "../state/template-store";

interface TeacherTemplateLibraryProps {
  open: boolean;
  templates: PromptTemplate[];
  onApply: (prompt: string) => void;
  onClose: () => void;
}

export const TeacherTemplateLibrary = ({
  open,
  templates,
  onApply,
  onClose
}: TeacherTemplateLibraryProps) => {
  if (!open) {
    return null;
  }

  const groups = templates.reduce<Record<string, PromptTemplate[]>>((acc, template) => {
    const key = template.category || "custom";
    acc[key] ??= [];
    acc[key].push(template);
    return acc;
  }, {});

  return (
    <section className="teacher-template-library" data-testid="teacher-template-library">
      <div className="teacher-template-library-header">
        <div>
          <h3>模板库</h3>
          <p>按教师场景快速起稿，再继续补图或讲题。</p>
        </div>
        <button
          type="button"
          data-testid="teacher-template-library-close"
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      {Object.entries(groups).map(([category, items]) => (
        <section key={category} className="teacher-template-library-group">
          <h4>{category}</h4>
          <div className="teacher-template-library-items">
            {items.map((template) => (
              <button
                key={template.id}
                type="button"
                className="teacher-template-library-item"
                onClick={() => onApply(template.prompt)}
              >
                {template.title}
              </button>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
};
