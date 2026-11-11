import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { closeCallOrder, ANSWER_LABEL } from "../../helpers/missedRules";
import { useLawstinData } from "../../helpers/useLawstinData";
import { useLogStudy } from "../../helpers/useLogStudy";
import { haptic } from "../../helpers/haptics";
import type { ChoiceDTO, QuestionDTO } from "../../endpoints/state_GET.schema";
import { Button } from "../Button";
import { ToolFrame, type ToolProps } from "./ExamTools";
import quiz from "../QuizSession.module.css";
import styles from "./ExamTools.module.css";

type Pair = { q: QuestionDTO; choices: ChoiceDTO[] };
export default function CloseCalls({ course, onClose }: ToolProps) {
  const { query } = useLawstinData();
  const log = useLogStudy();
  const pool = useMemo(() => closeCallOrder(query.data?.questions ?? [], query.data?.progress ?? [], course), [query.data, course]);
  const used = useRef(new Set<string>());
  const [round, setRound] = useState<Pair[]>([]);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(20);
  const [done, setDone] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const draw = () => {
    let available = pool.filter(q => !used.current.has(q.id));
    if (!available.length) { used.current.clear(); available = pool; }
    if (available.length < 10) available = [...available, ...pool.filter(q => !available.some(p => p.id === q.id))];
    const next = available.slice(0, 10).map(q => {
      used.current.add(q.id);
      const choices = [q.choices.find(c => c.id === q.answer)!, q.choices.find(c => c.role === "sneaky")!];
      if (Math.random() < 0.5) choices.reverse();
      return { q, choices };
    });
    setRound(next); setI(0); setPicks([]); setSeconds(20); setDone(false);
  };
  useEffect(() => { if (!round.length && pool.length) draw(); }, [pool, round.length]);
  const pair = round[i], picked = picks[i], revealed = picked !== undefined;
  const choose = (n: number) => {
    if (revealed || done) return;
    haptic(); setPicks(p => p[i] !== undefined ? p : [...p, n]);
  };
  useEffect(() => {
    if (!pair || revealed || done) return;
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [pair, revealed, done]);
  useEffect(() => { if (pair && seconds === 0 && !revealed) choose(-1); }, [pair, seconds, revealed]);
  useEffect(() => { if (revealed || done) nextRef.current?.focus({ preventScroll: true }); }, [revealed, done]);
  const next = () => {
    if (!revealed || done) return;
    if (i === round.length - 1) {
      round.forEach((p, n) => log("drill", `close-call:${p.q.id}`, p.choices[picks[n]]?.id === p.q.answer));
      setDone(true); haptic();
    } else { setI(n => n + 1); setSeconds(20); }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || done || !pair) return;
      if (["1", "2", "a", "b", "A", "B"].includes(e.key) && !revealed) { e.preventDefault(); choose(["1", "a", "A"].includes(e.key) ? 0 : 1); }
      else if (e.key === "Enter" && revealed) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [pair, revealed, picks, done]);
  const score = round.filter((p, n) => p.choices[picks[n]]?.id === p.q.answer).length;
  return <ToolFrame title="Close calls" onClose={onClose}>
    {!pair ? <div className={`${styles.card} ${styles.empty}`}><h2>{query.isFetching ? "Loading questions…" : "No seen questions yet"}</h2></div> : done ? <div className={styles.columns}>
      <div className={styles.card}><div className={styles.score}>{score} of {round.length}</div></div>
      <div className={styles.buttons}><Button className={quiz.cta} ref={nextRef} onClick={draw}>Next round</Button><Button variant="secondary" onClick={onClose}>Done</Button></div>
    </div> : <>
      <div className={styles.chips}><span className={styles.chip}>Question {i + 1} of {round.length}</span><span className={`${styles.chip} ${seconds < 6 ? styles.red : ""}`} role="timer">0:{String(seconds).padStart(2, "0")}</span>{picked === -1 && <span className={styles.chip}>Time’s up</span>}</div>
      <div className={styles.columns}>
        <div className={styles.stack}><h2 className={styles.heading}>{pair.q.prompt}</h2><p className={styles.reading}>{pair.q.stem}</p></div>
        <div className={styles.stack}>
          <div className={quiz.choices} role="group" aria-label="Close call choices">{pair.choices.map((c, n) => <button key={c.id} disabled={revealed} aria-pressed={picked === n} className={`${quiz.choice} ${picked === n ? quiz.selected : ""}`} onClick={() => choose(n)}><span className={quiz.letter}>{"AB"[n]}</span><span className={quiz.choiceText}>{c.text}</span>{revealed && (c.id === pair.q.answer ? <Check size={20} className={styles.correct} /> : <X size={20} className={styles.wrong} />)}</button>)}</div>
          {revealed && <><div className={styles.card}>{pair.choices.map(c => <div key={c.id} className={styles.detail}><span className={`${styles.chip} ${c.id === pair.q.answer ? styles.correct : styles.wrong}`}>{ANSWER_LABEL[c.role]}</span><p className={styles.reading}>{c.why}</p></div>)}{pair.q.rule && <div className={styles.detail}><span className={styles.title}>Rule</span><p className={styles.reading}>{pair.q.rule}</p><span className={styles.muted}>{pair.q.authority}</span></div>}</div><div className={styles.buttons}><Button className={quiz.cta} ref={nextRef} onClick={next}>Next</Button></div></>}
        </div>
      </div>
    </>}
  </ToolFrame>;
}
