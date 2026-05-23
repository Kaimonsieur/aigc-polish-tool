type DiffPart = {
  text: string;
  type?: "add" | "remove";
};

export function DiffText({ parts }: { parts: DiffPart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        <span
          key={`${part.type || "same"}-${index}`}
          className={part.type === "add" ? "diff-add" : part.type === "remove" ? "diff-remove" : undefined}
        >
          {part.text}
        </span>
      ))}
    </>
  );
}
