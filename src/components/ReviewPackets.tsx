import { useRef, useState } from "react";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import {
  bankKey,
  complete,
  correct,
  field,
  freshRound,
  newEntry,
  parsePacket,
  usePackets,
  writing,
  type Entry,
  type Key,
  type Packet,
  type Question,
  type Round,
  type Section,
} from "../helpers/reviewPackets";
import type { SchoolCourse } from "../helpers/studyMaterials";
import styles from "./ReviewPackets.module.css";

type Write = (key: string, value: string) => void;

function Written({
  name,
  label,
  answerKey,
  round,
  write,
}: {
  name: string;
  label: string;
  answerKey: Key;
  round: Round;
  write: Write;
}) {
  const value = round.answers[name] ?? "";
  if (!round.submitted)
    return (
      <label>
        {label}
        <Textarea rows={3} value={value} onChange={(e) => write(name, e.target.value)} />
      </label>
    );
  return (
    <div className={styles.written}>
      <strong>{label}</strong>
      <div className={styles.compare}>
        <div>
          <h5>Your answer</h5>
          <p>{value || "Unanswered"}</p>
        </div>
        <div>
          <h5>Model answer</h5>
          <p>{answerKey.model}</p>
          <ul>
            {answerKey.criteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      <label>
        Self-review
        <select
          value={round.answers[name + ":mark"] ?? ""}
          onChange={(e) => write(name + ":mark", e.target.value)}
        >
          <option value="">Pending self-review</option>
          <option>Met criteria</option>
          <option>Partially met</option>
          <option>Needs practice</option>
        </select>
      </label>
    </div>
  );
}
function QuestionCard({
  q,
  s,
  n,
  entry,
  write,
}: {
  q: Question;
  s: Section;
  n: number;
  entry: Entry;
  write: Write;
}) {
  const round = entry.main,
    review = round.submitted,
    a = round.answers;
  const pick = a[field(q, "pick")],
    expected = correct(q);
  const bank = s.definitions ?? q.choices ?? [];
  const order = entry.order[s.definitions ? bankKey(s) : field(q, "choices")] ?? [];
  const parts = writing(q, a);
  const renderPart = (p: (typeof parts)[number]) => (
    <Written
      key={p.part}
      name={field(q, p.part)}
      label={p.label}
      answerKey={p.key}
      round={round}
      write={write}
    />
  );
  const reveal = field(q, "reveal");
  const matchingOpen = review || !s.questions.some((item) => item.recall) || !!a[bankKey(s)];
  return (
    <article className={styles.card} id={"packet-question-" + q.id} tabIndex={-1}>
      {q.challenge && <strong>{q.challenge}</strong>}
      {q.facts && <p>{q.facts}</p>}
      <h4>
        {n}. {q.text}
      </h4>
      {parts.filter((p) => p.part === "recall").map(renderPart)}
      {!review && s.definitions && matchingOpen && (
        <label>
          Definition
          <select value={pick ?? ""} onChange={(e) => write(field(q, "pick"), e.target.value)}>
            <option value="">Choose a definition</option>
            {order.map((id) => (
              <option key={id} value={id}>
                {bank.find((o) => o.id === id)!.text}
              </option>
            ))}
          </select>
        </label>
      )}
      {!review && q.choices && q.recall && !a[reveal] && (
        <Button onClick={() => write(reveal, "yes")}>Reveal choices</Button>
      )}
      {!review && (q.truth !== undefined || (q.choices && (!q.recall || a[reveal]))) && (
        <fieldset>
          <legend>{q.truth === undefined ? "Choose one answer" : "Is the statement true?"}</legend>
          {(q.choices ? order : ["true", "false"]).map((id) => (
            <label className={styles.choice} key={id}>
              <input
                type="radio"
                name={field(q, "pick")}
                checked={pick === id}
                onChange={() => write(field(q, "pick"), id)}
              />
              {bank.find((o) => o.id === id)?.text ?? (id === "true" ? "True" : "False")}
            </label>
          ))}
        </fieldset>
      )}
      {review && expected !== undefined && (
        <div>
          <strong>{pick === expected ? "Correct" : pick ? "Incorrect" : "Unanswered"}</strong>
          <p>Your selection · {bank.find((o) => o.id === pick)?.text ?? pick ?? "None"}</p>
          <p>Correct answer · {bank.find((o) => o.id === expected)?.text ?? expected}</p>
        </div>
      )}
      {parts.filter((p) => p.part !== "recall").map(renderPart)}
      {review && (
        <>
          <p>{q.explanation}</p>
          {q.truth === false && <p>Corrected statement · {q.repair!.model}</p>}
          {q.choices && (
            <ul>
              {order.map((id) => {
                const o = bank.find((c) => c.id === id)!;
                return (
                  <li key={id}>
                    <strong>{o.text}</strong> — {o.why}
                  </li>
                );
              })}
            </ul>
          )}
          {q.caseIdentification && <p>{q.caseIdentification}</p>}
          <p>Source · {q.source}</p>
        </>
      )}
    </article>
  );
}
function Tomorrow({
  entry,
  index,
  save,
  back,
}: {
  entry: Entry;
  index: number;
  save: (e: Entry) => void;
  back: () => void;
}) {
  const round = entry.visits[index];
  const update = (next: Round) =>
    save({ ...entry, visits: entry.visits.map((r, i) => (i === index ? next : r)) });
  const write: Write = (k, v) => update({ ...round, answers: { ...round.answers, [k]: v } });
  return (
    <>
      <Button variant="outline" onClick={back}>
        Back to packet
      </Button>
      <h3>Try tomorrow · Attempt {index + 1}</h3>
      {entry.packet.tomorrow.map((p) => (
        <article key={p.id} className={styles.card}>
          <Written label={p.text} name={field(p, "tomorrow")} answerKey={p.key} round={round} write={write} />
          {round.submitted && <p>Source · {p.source}</p>}
        </article>
      ))}
      {!round.submitted && (
        <>
          <p>
            Unanswered ·{" "}
            {entry.packet.tomorrow.filter((p) => !round.answers[field(p, "tomorrow")]?.trim()).length}
          </p>
          <Button onClick={() => update({ ...round, submitted: true })}>Review this attempt</Button>
        </>
      )}
    </>
  );
}
function Worksheet({ entry, save, close }: { entry: Entry; save: (e: Entry) => void; close: () => void }) {
  const [visit, setVisit] = useState<number | null>(null);
  const { packet, main } = entry,
    a = main.answers,
    review = main.submitted;
  const section = packet.sections[entry.section];
  const questions = packet.sections.flatMap((s) => s.questions);
  const number = (q: Question) => questions.indexOf(q) + 1;
  const unanswered = questions.filter((q) => !complete(q, a));
  const objective = questions.filter((q) => correct(q) !== undefined);
  const pending = questions.flatMap((q) => writing(q, a).filter((p) => !a[field(q, p.part) + ":mark"]));
  const write: Write = (k, v) => save({ ...entry, main: { ...main, answers: { ...a, [k]: v } } });
  const jump = (q: Question) => {
    if (!review) save({ ...entry, section: packet.sections.findIndex((s) => s.questions.includes(q)) });
    requestAnimationFrame(() => document.getElementById("packet-question-" + q.id)?.focus());
  };
  if (visit !== null && entry.visits[visit])
    return <Tomorrow entry={entry} index={visit} save={save} back={() => setVisit(null)} />;
  return (
    <>
      <Button variant="outline" onClick={close}>
        Back to course
      </Button>
      <h2>{packet.title}</h2>
      <p>{packet.instructions}</p>
      {review ? (
        <>
          <h3>Packet results</h3>
          <p>
            {objective.filter((q) => a[field(q, "pick")] === correct(q)).length} of {objective.length}{" "}
            objective answers correct · {pending.length} pending self-review
          </p>
          <details>
            <summary>Topic index</summary>
            {[...new Set(questions.flatMap((q) => q.topics))].map((t) => (
              <div key={t}>
                <h4>{t}</h4>
                {questions
                  .filter((q) => q.topics.includes(t))
                  .map((q) => (
                    <Button variant="link" key={q.id} onClick={() => jump(q)}>
                      Question {number(q)} · {q.tasks.join(", ")}
                    </Button>
                  ))}
              </div>
            ))}
          </details>
          {packet.tomorrow.length > 0 && (
            <section>
              <h3>Try tomorrow</h3>
              {entry.visits.map((r, i) => (
                <Button variant="outline" key={i} onClick={() => setVisit(i)}>
                  {r.submitted ? "Review" : "Resume"} attempt {i + 1}
                </Button>
              ))}
              {entry.visits.every((r) => r.submitted) && (
                <Button
                  onClick={() => {
                    save({ ...entry, visits: [...entry.visits, freshRound()] });
                    setVisit(entry.visits.length);
                  }}
                >
                  Start fresh attempt
                </Button>
              )}
            </section>
          )}
        </>
      ) : (
        <label>
          Worksheet section
          <select value={entry.section} onChange={(e) => save({ ...entry, section: Number(e.target.value) })}>
            {packet.sections.map((s, i) => (
              <option key={s.kind} value={i}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {(review ? packet.sections : [section]).map((s) => (
        <section key={s.kind} className={styles.section}>
          <h3>{s.title}</h3>
          {s.questions.map((q) => (
            <QuestionCard key={q.id} q={q} s={s} n={number(q)} entry={entry} write={write} />
          ))}
          {!review && s.definitions && s.questions.some((q) => q.recall) && !a[bankKey(s)] && (
            <Button onClick={() => write(bankKey(s), "yes")}>Reveal definition bank</Button>
          )}
        </section>
      ))}
      {!review && (
        <>
          {entry.section < packet.sections.length - 1 && (
            <Button variant="outline" onClick={() => jump(packet.sections[entry.section + 1].questions[0])}>
              Next section
            </Button>
          )}
          <details open={unanswered.length > 0}>
            <summary>{unanswered.length} unanswered or incomplete</summary>
            {unanswered.map((q) => (
              <Button key={q.id} variant="link" onClick={() => jump(q)}>
                Question {number(q)}
              </Button>
            ))}
          </details>
          <Button onClick={() => save({ ...entry, main: { ...main, submitted: true } })}>
            Submit packet
          </Button>
        </>
      )}
    </>
  );
}
export function ReviewPackets({ course, id }: { course: SchoolCourse; id?: string }) {
  const { entries, save, loading, error } = usePackets(course);
  const [preview, setPreview] = useState<Packet | null>(null),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  const go = (next?: string) => {
    window.location.hash = "/courses/" + course + (next ? "/packets/" + next : "");
  };
  const persist = (e: Entry) => {
    try {
      save(e);
      setMessage("");
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error && !(error instanceof DOMException)
          ? error.message
          : "Couldn’t save on this device. Free storage and try again.",
      );
      return false;
    }
  };
  const entry = entries.find((e) => e.id === id);
  return (
    <section className={styles.panel} aria-label="Review packets">
      {message && <p role="alert">{message}</p>}
      {id ? (
        entry ? (
          <Worksheet entry={entry} save={persist} close={() => go()} />
        ) : (
          <p>{loading ? "Loading packet…" : "Packet unavailable."}</p>
        )
      ) : (
        <>
          <h2>Review packets</h2>
          <input
            ref={file}
            type="file"
            hidden
            accept=".json,application/json"
            onChange={async (e) => {
              const chosen = e.target.files?.[0],
                seq = ++sequence.current;
              e.target.value = "";
              setPreview(null);
              setMessage("");
              if (!chosen) return;
              try {
                const parsed = parsePacket(await chosen.text());
                if (seq === sequence.current) setPreview(parsed);
              } catch (err) {
                if (seq === sequence.current)
                  setMessage(err instanceof Error ? err.message : "Couldn’t read the file.");
              }
            }}
          />
          <Button variant="outline" onClick={() => file.current?.click()}>
            Import review packet
          </Button>
          {preview && (
            <div className={styles.card}>
              <h3>{preview.title}</h3>
              <ul>
                {preview.sections.map((s) => (
                  <li key={s.kind}>
                    {s.title} · {s.questions.length}
                  </li>
                ))}
                <li>Try tomorrow · {preview.tomorrow.length}</li>
              </ul>
              <Button
                onClick={() => {
                  const e = newEntry(preview);
                  if (persist(e)) {
                    setPreview(null);
                    go(e.id);
                  }
                }}
              >
                Save to course
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </div>
          )}
          {error && <p>Course sync unavailable. Showing packets saved on this device.</p>}
          {entries.map((e) => (
            <Button key={e.id} variant="secondary" onClick={() => go(e.id)}>
              {e.packet.title} · {e.main.submitted ? "Review results" : "Resume"}
            </Button>
          ))}
        </>
      )}
    </section>
  );
}
