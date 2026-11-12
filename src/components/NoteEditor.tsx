import { useEffect, useRef, useState } from "react";
import type { NoteRow } from "../helpers/useNotes";
import styles from "./tools/Notes.module.css";
export function NoteEditor({
  topic,
  note,
  onChange,
  onBlur,
}: {
  topic: string;
  note: NoteRow;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const [val, setVal] = useState(note.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setVal(note.text);
  }, [note.text]);

  const resize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(140, textareaRef.current.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    resize();
  }, [val]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setVal(next);
    onChange(next);
  };

  const insertPrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const nextVal = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    setVal(nextVal);
    onChange(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolBtn}
          type="button"
          onClick={() => insertPrefix("- ")}
          aria-label="Add bullet"
        >
          • Bullet
        </button>
        <button
          className={styles.toolBtn}
          type="button"
          onClick={() => insertPrefix("# ")}
          aria-label="Add heading"
        >
          # Heading
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className={styles.notesTextarea}
        value={val}
        onChange={handleChange}
        onBlur={onBlur}
        aria-label={`Notes for ${topic}`}
      />
    </div>
  );
}
