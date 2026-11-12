import React from "react";
import { BottomSheet } from "./BottomSheet";
import styles from "./KeyboardShortcuts.module.css";

type ShortcutRow = {
  keys: string[];
  description: string;
};

type ShortcutSection = {
  title: string;
  rows: ShortcutRow[];
};

const SECTIONS: ShortcutSection[] = [
  {
    title: "Search and navigation",
    rows: [
      { keys: ["⌘K", "/"], description: "Open search" },
      { keys: ["⌘1", "–", "⌘4"], description: "Switch tabs" },
      { keys: ["Esc"], description: "Clear search or close" },
      { keys: ["?"], description: "Keyboard shortcuts" },
    ],
  },
  {
    title: "Quiz practice",
    rows: [
      { keys: ["A", "B", "C", "D"], description: "Choose answer" },
      { keys: ["1", "2", "3", "4"], description: "Choose answer by number" },
      { keys: ["Enter"], description: "Check answer or continue" },
      { keys: ["←", "→"], description: "Revisit earlier question" },
      { keys: ["Esc"], description: "Leave session" },
    ],
  },
  {
    title: "Practice exam",
    rows: [
      { keys: ["F"], description: "Flag question for review" },
      { keys: ["M"], description: "Mark as guessed" },
      { keys: ["Enter"], description: "Next question" },
    ],
  },
  {
    title: "Flashcards",
    rows: [
      { keys: ["Space", "Enter"], description: "Flip card" },
      { keys: ["1", "2", "3", "4"], description: "Grade recall" },
      { keys: ["←", "→"], description: "Previous or next card" },
      { keys: ["Esc"], description: "Close flashcards" },
    ],
  },
];

export function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="Keyboard shortcuts" onClose={onClose}>
      <div className={styles.container}>
        {SECTIONS.map((sec) => (
          <section key={sec.title} className={styles.section}>
            <h3 className={styles.sectionTitle}>{sec.title}</h3>
            <div className={styles.card}>
              {sec.rows.map((r, i) => (
                <div key={i} className={styles.row}>
                  <span className={styles.desc}>{r.description}</span>
                  <div className={styles.keys}>
                    {r.keys.map((k, ki) =>
                      k === "–" ? (
                        <span key={ki} className={styles.dash}>
                          –
                        </span>
                      ) : (
                        <kbd key={ki} className={styles.kbd}>
                          {k}
                        </kbd>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </BottomSheet>
  );
}
