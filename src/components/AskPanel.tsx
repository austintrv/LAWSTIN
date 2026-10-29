import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { Textarea } from "./Textarea";
import { useLawstinAi } from "../helpers/useLawstinAi";
import { AiRequestError } from "../endpoints/ai_POST.schema";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { haptic } from "../helpers/haptics";
import { useBackClose } from "../helpers/useBackClose";
import { useSwipeDown } from "../helpers/useSwipeDown";
import styles from "./AskPanel.module.css";

type Msg = { role: "user" | "assistant"; content: string };

export function AskPanel({ question, picked, onClose, className }: { question: QuestionDTO; picked: string | null; onClose: () => void; className?: string }) {
  const { ask } = useLawstinAi();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const wrong = picked && picked !== question.answer;

  const starters = [
    wrong ? `Why is ${picked} wrong?` : `Why is ${question.answer} right?`,
    "Explain the rule in plain terms",
    "Change one fact. Does the answer change?",
    "How would this show up on the exam?",
  ];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, ask.isPending]);

  const close = () => { setClosing(true); setTimeout(onClose, 320); };
  useBackClose(close);
  const swipe = useSwipeDown<HTMLDivElement>(close);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || ask.isPending) return;
    haptic();
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setDraft("");
    setErr(null);
    try {
      const res = await ask.mutateAsync({ question, picked: (picked as "A" | "B" | "C" | "D" | null) ?? null, messages: next.slice(-20) });
      setMsgs((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setErr(e instanceof AiRequestError || e instanceof Error ? e.message : "Something went wrong. Try again.");
      setMsgs(msgs);
      setDraft(t);
    }
  };

  return (
    <div ref={swipe.ref} className={`${styles.panel} ${closing ? styles.closing : ""} ${className ?? ""}`} role="dialog" aria-modal="true" aria-label="Ask about this question">
      <div className={styles.head} {...swipe.handle}>
        <div className={styles.headIn}>
          <h2>Ask about this question</h2>
          <button className={styles.x} onClick={close} aria-label="Close"><X size={16} strokeWidth={2.4} /></button>
        </div>
      </div>

      <div className={styles.scroll}>
        <div className={styles.thread}>
          <div className={styles.context}>
            <span>{question.topic}{question.subtopic ? ` · ${question.subtopic}` : ""}</span>
            <p>{question.prompt}</p>
          </div>
          {!msgs.length && (
            <div className={styles.starters}>
              {starters.map((s) => <button key={s} className={styles.starter} onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? styles.me : styles.tutor}>
              {m.content.split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}
            </div>
          ))}
          {ask.isPending && <div className={`${styles.tutor} ${styles.typing}`} aria-label="Writing"><i /><i /><i /></div>}
          {err && <p className={styles.err}>{err}</p>}
          <div ref={endRef} />
        </div>
      </div>

      <form className={styles.compose} onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <div className={styles.composeIn}>
          <Textarea className={styles.input} value={draft} rows={1} placeholder="Ask a follow-up"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
          <button type="submit" className={styles.send} disabled={!draft.trim() || ask.isPending} aria-label="Send"><ArrowUp size={18} strokeWidth={2.6} /></button>
        </div>
      </form>
    </div>
  );
}
