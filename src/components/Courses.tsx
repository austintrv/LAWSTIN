import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, ClipboardList, Columns3, GitBranch, GraduationCap, Highlighter, Layers3, ListChecks, PenLine, Printer, RotateCcw, Scale, Search, Star, X } from "lucide-react";
import type { OutputType as QuestionState } from "../endpoints/state_GET.schema";
import { dateKey } from "../helpers/dateKey";
import { haptic } from "../helpers/haptics";
import { useBackClose } from "../helpers/useBackClose";
import { toast } from "../helpers/toast";
import { useStudyMaterials } from "../helpers/useStudyMaterials";
import { useLogStudy } from "../helpers/useLogStudy";
import { cardQueue, MATERIAL_LABELS, reviewCard, SCHOOL_COURSES, SCHOOL_ORDER, weakMaterialTopics, type Flashcard, type MaterialKind, type SchoolCourse, type StudyMaterial, type StudyRecord } from "../helpers/studyMaterials";
import type { CourseCode } from "../helpers/studyEngine";
import { TaskList, type WorkspaceLink } from "./TaskList";
import { dueSoon, sortTasks, useCourseTasks } from "../helpers/useCourseTasks";
import styles from "./Courses.module.css";

const ICONS = { il: Scale, asy: BookOpen, pr: GraduationCap, clinic: ClipboardList, tutoring: PenLine };
const TOOLS = { flashcard: Layers3, flowchart: GitBranch, outline: BookOpen, comparison: Columns3, drill: ListChecks, hypothetical: PenLine };
const KINDS = Object.keys(MATERIAL_LABELS) as MaterialKind[];
type Props = { userId: string; state?: QuestionState; onQuiz: (course: CourseCode, topic?: string) => void; onWrite: () => void };
type Store = ReturnType<typeof useStudyMaterials>;
type Route = { course?: SchoolCourse; kind?: MaterialKind; item?: string };
const readRoute = (): Route => {
  const [, section, course, kind, item] = window.location.hash.split("/");
  if (section !== "courses" || !SCHOOL_ORDER.includes(course as SchoolCourse)) return {};
  return { course: course as SchoolCourse, kind: KINDS.includes(kind as MaterialKind) ? kind as MaterialKind : undefined, item };
};
const go = (course?: SchoolCourse, kind?: MaterialKind, item?: string) => {
  haptic(); window.location.hash = ["", "courses", course, kind, item].filter(x => x !== undefined).join("/");
};
const DRIVE = (id: string, kind: "file" | "sheet") => kind === "sheet" ? `https://docs.google.com/spreadsheets/d/${id}/edit` : `https://drive.google.com/file/d/${id}/view`;
const LINKS: Record<"clinic" | "tutoring", WorkspaceLink[]> = {
  clinic: [
    { title: "Clinic hour log", url: DRIVE("1Wze1NS6Jf4YDvSMQjM8zBI63MGQy8BaDHUE1n96S6N4", "sheet") },
    { title: "Clinic syllabus", url: DRIVE("13cVAB0XHq30N1B5hPLSPsnM5DBPEHxRA", "file") },
    { title: "Law student manual", url: DRIVE("1sKnwwB_un0Tpcv5OYMCL__ftKvrbT2gv", "file") },
  ],
  tutoring: [
    { title: "Office hours", url: DRIVE("1dUsZ0ImsLMPNFvycfa4saivtGx3ubYClA0mUc6b-vi0", "sheet") },
    { title: "Civil Procedure syllabus", url: DRIVE("1HLxMtbzvU-A8uu67mg2Vo7xjBeDRoHqa", "file") },
    { title: "Tutor orientation", url: DRIVE("1go4tBPtHpt6mNQaYo1h9VqPFIgkDc8T_", "file") },
  ],
};
const isStudyCourse = (c: SchoolCourse): c is CourseCode => c === "il" || c === "asy" || c === "pr";

export function Courses({ userId, state, onQuiz, onWrite }: Props) {
  const store = useStudyMaterials(userId);
  const { tasks } = useCourseTasks();
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [deck, setDeck] = useState<Flashcard[] | null>(null);
  const [selected, setSelected] = useState<StudyMaterial | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => { setRoute(readRoute()); setTopic("all"); setSearch(""); };
    window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (route.item) setSelected(store.materials.find(m => m.id === route.item && m.course === route.course) ?? null);
    else setSelected(null);
  }, [route.course, route.kind, route.item, store.materials]);
  // Scroll to the top only when the route changes, never on a data refresh.
  useEffect(() => { root.current?.closest("[data-pane]")?.scrollTo({ top: 0 }); }, [route.course, route.kind, route.item]);

  const offline = store.syncStatus === "offline";
  useEffect(() => { if (offline) toast("Offline. Study progress will sync later."); }, [offline]);
  const course = route.course;
  const materials = course ? store.materials.filter(m => m.course === course) : store.materials;
  const cards = materials.filter((m): m is Flashcard => m.kind === "flashcard");
  const queue = cardQueue(cards, store.record, state);
  const weak = weakMaterialTopics(state);
  const topics = [...new Set(materials.map(m => m.topic))];
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = materials.filter(m => (!route.kind || m.kind === route.kind) && (topic === "all" || m.topic === topic)
    && terms.every(term => JSON.stringify(m).toLocaleLowerCase().includes(term)));
  const startCards = (list = queue) => { if (list.length) setDeck(list.slice(0, 30)); };
  // #/courses/review (from the Study tab) opens a flashcard session as soon as the library is ready.
  useEffect(() => {
    if (window.location.hash !== "#/courses/review" || store.loading) return;
    history.replaceState(null, "", "#/courses");
    startCards();
  }, [store.loading, route]);
  const open = (m: StudyMaterial) => {
    if (m.kind === "flashcard") startCards(cardQueue([m, ...cards.filter(c => c.id !== m.id)], store.record, state, dateKey.today(), true).sort((a, b) => Number(b.id === m.id) - Number(a.id === m.id)));
    else go(m.course, m.kind, m.id);
  };

  return <div ref={root} className={styles.courses}>
    {!course ? <>
      <div className={styles.sectionHead}><h2>Your courses</h2><button className={styles.primary} disabled={!queue.length} onClick={() => startCards()}><Layers3 size={20} />{queue.length ? `Review ${Math.min(queue.length, 30)} flashcards` : store.unavailable ? "Flashcards unavailable offline" : "Flashcards up to date"}</button></div>
      <div className={styles.courseGrid}>
        {SCHOOL_ORDER.map((key, index) => {
          const c = SCHOOL_COURSES[key], Icon = ICONS[key];
          const list = store.materials.filter(m => m.course === key);
          const due = cardQueue(list.filter((m): m is Flashcard => m.kind === "flashcard"), store.record, state).length;
          return <button key={key} className={`${styles.courseCard} ${isStudyCourse(key) ? "" : styles.workspaceCard}`} style={{ "--course-color": c.color, "--order": index } as React.CSSProperties} onClick={() => go(key)}>
            <div className={styles.courseCardTop}><span className={styles.courseIcon}><Icon size={26} strokeWidth={1.6} /></span><ArrowRight size={22} /></div>
            <h3>{c.name}</h3>{isStudyCourse(key) ? (store.loading ? <span className={styles.skel} /> : store.unavailable ? <p>Unavailable offline</p> : <p>{`${list.length} materials${due ? ` · ${due} cards ready` : ""}`}</p>) : <p>{workspaceLine(tasks.filter(t => t.course === key))}</p>}
            {isStudyCourse(key) && <div className={styles.courseTools}><span><GitBranch size={18} />Flowcharts</span><span><Layers3 size={18} />Flashcards</span></div>}
          </button>;
        })}
      </div>
      <section className={styles.searchSection}><div className={styles.sectionHead}><h2>Across your courses</h2><BookOpen size={24} /></div>
        <SearchField value={search} onChange={setSearch} />
        {search.trim() ? <MaterialGrid list={filtered} record={store.record} onOpen={open} /> : <div className={styles.methodGrid}>{KINDS.map(kind => {
          const Icon = TOOLS[kind]; return <div key={kind}><Icon size={25} strokeWidth={1.6} /><h3>{MATERIAL_LABELS[kind]}</h3><span>{store.materials.filter(m => m.kind === kind).length}</span></div>;
        })}</div>}
      </section>
      {store.runs[0] && <section className={styles.runNote}><div><p className={styles.overline}>Latest study update</p><h2>{store.runs[0].added} materials added</h2></div><div className={styles.runChips}>{SCHOOL_ORDER.filter(k => store.runs[0].by_course[k]).map(k => <button key={k} style={{ "--course-color": SCHOOL_COURSES[k].color } as React.CSSProperties} onClick={() => go(k)}><i />{SCHOOL_COURSES[k].short}<small>{store.runs[0].by_course[k]}</small></button>)}</div></section>}
    </> : <>
      <button className={styles.back} onClick={() => go()}><ArrowLeft size={20} />All courses</button>
      <section className={styles.courseHero} style={{ "--course-color": SCHOOL_COURSES[course].color } as React.CSSProperties}>
        <h2>{SCHOOL_COURSES[course].name}</h2>
        {isStudyCourse(course) ? <div className={styles.heroActions}><button className={styles.primary} onClick={() => startCards()} disabled={!queue.length}><Layers3 size={20} />{queue.length ? `Review ${Math.min(queue.length, 30)} cards` : store.unavailable ? "Flashcards unavailable offline" : "Flashcards up to date"}</button><button className={styles.secondary} onClick={() => onQuiz(course)}>Practice questions<ArrowRight size={18} /></button></div> : null}
      </section>
      {!isStudyCourse(course) ? <TaskList course={course} color={SCHOOL_COURSES[course].color} links={LINKS[course]} /> : <div className={styles.courseWorkspace}>
        <aside className={styles.sidebar}><nav aria-label="Course study tools"><button aria-current={!route.kind ? "page" : undefined} onClick={() => go(course)}><BookOpen size={20} />All materials<span>{materials.length}</span></button>{KINDS.map(kind => {
          const Icon = TOOLS[kind]; return <button key={kind} aria-current={route.kind === kind ? "page" : undefined} onClick={() => go(course, kind)}><Icon size={20} />{MATERIAL_LABELS[kind]}<span>{materials.filter(m => m.kind === kind).length}</span></button>;
        })}</nav><button className={styles.writingLink} onClick={onWrite}><PenLine size={20} />Written practice<ArrowRight size={18} /></button></aside>
        <div className={styles.materialsPanel}>
          <div className={styles.sectionHead}><h3>{route.kind ? MATERIAL_LABELS[route.kind] : "Study materials"}</h3><button className={styles.iconButton} aria-label="Print course materials" onClick={() => window.print()}><Printer size={21} /></button></div>
          <SearchField value={search} onChange={setSearch} />
          <label className={styles.topicSelect}><span>Topic</span><select value={topic} onChange={e => setTopic(e.target.value)}><option value="all">All topics</option>{topics.map(t => <option key={t}>{t}</option>)}</select></label>
          <StudyPlan materials={materials} record={store.record} weak={weak} onOpen={open} />
          {store.loading ? null : <MaterialGrid list={filtered} record={store.record} onOpen={open} />}
        </div>
      </div>}
    </>}
    {deck && <FlashcardSession key={deck.map(c => c.id).join(",")} cards={deck} store={store} onClose={() => setDeck(null)} />}
    {selected && <MaterialReader key={selected.id} material={selected} store={store} onQuiz={() => onQuiz(selected.course, selected.topic)} onClose={() => go(selected.course, selected.kind)} />}
  </div>;
}

function workspaceLine(list: Parameters<typeof sortTasks>[0]) {
  const open = sortTasks(list).open.length, soon = dueSoon(list).length;
  return open ? `${open} open${soon ? ` · ${soon} due soon` : ""}` : "No open tasks";
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className={styles.search}><Search size={22} /><input aria-label="Search study materials" type="search" placeholder="Search rules, cases, and topics" value={value} onChange={e => onChange(e.target.value)} />{value && <button aria-label="Clear search" onClick={() => onChange("")}><X size={20} /></button>}</label>;
}

function MaterialGrid({ list, record, onOpen }: { list: StudyMaterial[]; record: StudyRecord; onOpen: (m: StudyMaterial) => void }) {
  if (!list.length) return <div className={styles.empty}><Search size={30} strokeWidth={1.5} /><h3>No materials found</h3></div>;
  return <div className={styles.materialGrid}>{list.map(m => {
    const Icon = TOOLS[m.kind]; return <button key={m.id} className={styles.materialCard} onClick={() => onOpen(m)}>
      <div className={styles.materialTop}><span><Icon size={19} />{MATERIAL_LABELS[m.kind]}</span>{record.starred[m.id] ? <Star size={19} fill="currentColor" /> : record.completed[m.id] ? <Check size={19} /> : <ChevronRight size={19} />}</div>
      <h4>{m.title}</h4><p>{m.topic}</p><span className={styles.materialCourse}>{SCHOOL_COURSES[m.course].short}</span>
    </button>;
  })}</div>;
}

function StudyPlan({ materials, record, weak, onOpen }: { materials: StudyMaterial[]; record: StudyRecord; weak: Set<string>; onOpen: (m: StudyMaterial) => void }) {
  const next = materials.filter(m => m.kind !== "flashcard" && !record.completed[m.id])
    .sort((a, b) => Number(weak.has(`${b.course}|${b.topic}`)) - Number(weak.has(`${a.course}|${a.topic}`)) || Number(record.confidence[b.id] === "shaky") - Number(record.confidence[a.id] === "shaky") || b.class_date.localeCompare(a.class_date)).slice(0, 3);
  if (!next.length) return null;
  return <details className={styles.plan}><summary>Next to review<span>{next.length}</span></summary>{next.map(m => <button key={m.id} onClick={() => onOpen(m)}><span>{m.title}</span>{weak.has(`${m.course}|${m.topic}`) && <span>Weak topic</span>}<ArrowRight size={19} /></button>)}</details>;
}

function StudyDialog({ title, children, onClose, actions }: { title: string; children: React.ReactNode; onClose: () => void; actions?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea, input, select, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const panes = document.querySelector("[data-app-panes]");
    panes?.setAttribute("inert", "");
    return () => { window.removeEventListener("keydown", onKey); panes?.removeAttribute("inert"); previous?.focus(); };
  }, []);
  // The dialog is portalled so that the underlying scrolling pane can be inert.
  return <DialogPortal><div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={styles.dialog}>
    <header className={styles.dialogHeader}><span>{title}</span><div>{actions}<button className={styles.iconButton} aria-label="Close study session" onClick={onClose}><X size={23} /></button></div></header>{children}
  </div></div></DialogPortal>;
}

import { createPortal } from "react-dom";
function DialogPortal({ children }: { children: React.ReactNode }) { return createPortal(children, document.body); }

function FlashcardSession({ cards, store, onClose }: { cards: Flashcard[]; store: Store; onClose: () => void }) {
  const log = useLogStudy();
  const [index, setIndex] = useState(0), [flipped, setFlipped] = useState(false), [known, setKnown] = useState(0);
  const card = cards[index];
  useBackClose(onClose);
  const grade = (correct: boolean) => {
    if (!flipped || !card) return;
    haptic(); store.update(prev => ({ ...prev, cards: { ...prev.cards, [card.id]: reviewCard(prev.cards[card.id], correct) } }));
    log("card", card.id, correct);
    setKnown(n => n + Number(correct)); setIndex(n => n + 1); setFlipped(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select,button,a")) return;
      if (e.code === "Space" && card) { e.preventDefault(); setFlipped(v => !v); }
      if (e.key === "1") grade(false);
      if (e.key === "2") grade(true);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [card, flipped]);
  return <StudyDialog title="Flashcards" onClose={onClose} actions={card && <StarButton material={card} store={store} />}>
    {card ? <div className={styles.cardSession}>
      <div className={styles.sessionMeta}><span style={{ color: SCHOOL_COURSES[card.course].color }}>{SCHOOL_COURSES[card.course].name}</span><span aria-live="polite">{index + 1} of {cards.length}</span></div>
      <progress max={cards.length} value={index} aria-label="Flashcard session progress" />
      <button className={`${styles.recallCard} ${flipped ? styles.recalled : ""}`} onClick={() => { haptic(); setFlipped(v => !v); }} aria-label={flipped ? "Show prompt" : "Reveal answer"} aria-expanded={flipped}>
        <span className={styles.overline}>{flipped ? "Answer" : card.topic}</span><h2>{flipped ? card.back : card.front}</h2>{flipped ? <p>{card.reason}</p> : <span className={styles.revealPrompt}>Reveal answer<ArrowRight size={20} /></span>}
      </button>
      {flipped && <><p className={styles.authority}>{card.authority}</p><div className={styles.gradeActions}><button className={styles.secondary} onClick={() => grade(false)}><RotateCcw size={20} />Review tomorrow</button><button className={styles.primary} onClick={() => grade(true)}><Check size={20} />Recalled it</button></div><SourceList material={card} /></>}
    </div> : <div className={styles.sessionDone}><span className={styles.doneCircle}><Check size={40} /></span><h2>Session complete</h2><p>{known} of {cards.length} recalled.</p><button className={styles.primary} onClick={onClose}>Done</button></div>}
  </StudyDialog>;
}

function StarButton({ material, store }: { material: StudyMaterial; store: Store }) {
  const starred = !!store.record.starred[material.id];
  return <button className={styles.iconButton} aria-label={starred ? "Unstar material" : "Star material"} aria-pressed={starred} onClick={() => store.update(p => ({ ...p, starred: { ...p.starred, [material.id]: !starred } }))}><Star size={22} fill={starred ? "currentColor" : "none"} /></button>;
}

function SourceList({ material }: { material: StudyMaterial }) {
  return <details className={styles.sources}><summary>Sources<ChevronRight size={18} /></summary>{material.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"><span>{s.title}</span><span>{s.section}</span><ArrowRight size={18} /></a>)}</details>;
}

function MaterialReader({ material: m, store, onQuiz, onClose }: { material: StudyMaterial; store: Store; onQuiz: () => void; onClose: () => void }) {
  const [font, setFont] = useState(0);
  const [hideDone, setHideDone] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const confidence = store.record.confidence[m.id];
  const highlights = store.record.highlights[m.id] ?? [];
  const highlight = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length > 500 || !body.current?.contains(selection?.anchorNode ?? null) || !body.current?.contains(selection?.focusNode ?? null)) { toast("Select some text to highlight"); return; }
    store.update(p => ({ ...p, highlights: { ...p.highlights, [m.id]: [...new Set([...(p.highlights[m.id] ?? []), text])] } }));
    selection?.removeAllRanges();
  };
  const highlighted = (text: string) => {
    const terms = highlights.filter(t => text.includes(t)).sort((a, b) => b.length - a.length);
    if (!terms.length) return text;
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return text.split(new RegExp(`(${escaped.join("|")})`, "g")).map((part, i) => terms.includes(part) ? <mark key={i}>{part}</mark> : part);
  };
  const complete = (key: string) => store.update(p => ({ ...p, completed: { ...p.completed, [key]: !p.completed[key] } }));
  return <StudyDialog title={SCHOOL_COURSES[m.course].name} onClose={onClose} actions={<StarButton material={m} store={store} />}>
    <div className={styles.reader}>
      <div className={styles.readerTitle}><p className={styles.overline}>{MATERIAL_LABELS[m.kind]} · {m.topic}</p><h2>{m.title}</h2></div>
      <div className={styles.readerToolbar}><button onClick={() => setFont(n => Math.max(0, n - 1))} disabled={!font} aria-label="Smaller reading text">A−</button><button onClick={() => setFont(n => Math.min(3, n + 1))} disabled={font === 3} aria-label="Larger reading text">A+</button><button onClick={highlight}><Highlighter size={20} />Highlight</button><button onClick={() => window.print()}><Printer size={20} />Print</button></div>
      <div ref={body} data-selectable className={styles.readerBody} style={{ "--reading-size": `${19 + font * 2}px` } as React.CSSProperties}>
        {m.kind === "flowchart" && <FlowchartView material={m} />}
        {m.kind === "comparison" && <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={m.title}><table><thead><tr><th scope="col">Rule</th>{m.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{m.rows.map((r, i) => <tr key={i}><th scope="row">{r.label}<p className={styles.authority}>{r.authority}</p></th>{r.cells.map((c, k) => <td key={k}>{highlighted(c)}</td>)}</tr>)}</tbody></table></div>}
        {m.kind === "outline" && <><div className={styles.outlineControls}><button className={styles.secondary} aria-pressed={hideDone} onClick={() => setHideDone(v => !v)}>{hideDone ? "Show all sections" : "Hide checked sections"}</button><span>{m.sections.filter((_, i) => store.record.completed[`${m.id}:${i}`]).length} of {m.sections.length} checked</span></div>{m.sections.map((s, i) => hideDone && store.record.completed[`${m.id}:${i}`] ? null : <details key={i} className={styles.ruleSection} open><summary>{s.heading}</summary><p>{highlighted(s.text)}</p><p className={styles.authority}>{s.authority}</p><button className={styles.checkoff} aria-pressed={!!store.record.completed[`${m.id}:${i}`]} onClick={() => complete(`${m.id}:${i}`)}><span>{store.record.completed[`${m.id}:${i}`] && <Check size={17} />}</span>Checked off</button></details>)}</>}
        {m.kind === "drill" && <SortingDrill material={m} />}
        {m.kind === "hypothetical" && <HypotheticalView material={m} store={store} />}
      </div>
      {!!highlights.length && <details className={styles.highlights}><summary>Your highlights</summary>{highlights.map((text, i) => <div key={i}><mark>{text}</mark><button className={styles.iconButton} aria-label="Remove highlight" onClick={() => store.update(p => ({ ...p, highlights: { ...p.highlights, [m.id]: highlights.filter(t => t !== text) } }))}><X size={18} /></button></div>)}</details>}
      <SourceList material={m} />
      <div className={styles.confidence}><h3>Confidence</h3><div>{([ ["shaky", "Shaky"], ["learning", "Learning"], ["solid", "Solid"] ] as const).map(([key, label]) => <button key={key} aria-pressed={confidence === key} onClick={() => store.update(p => ({ ...p, confidence: { ...p.confidence, [m.id]: key } }))}>{label}</button>)}</div></div>
      <div className={styles.readerFooter}><button className={styles.secondary} aria-pressed={!!store.record.completed[m.id]} onClick={() => complete(m.id)}><Check size={20} />{store.record.completed[m.id] ? "Reviewed" : "Mark reviewed"}</button><button className={styles.primary} onClick={() => { onClose(); onQuiz(); }}>Practice this topic<ArrowRight size={18} /></button></div>
    </div>
  </StudyDialog>;
}

function FlowchartView({ material }: { material: Extract<StudyMaterial, { kind: "flowchart" }> }) {
  const [path, setPath] = useState<string[]>([material.start]);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [overview, setOverview] = useState(false);
  const nodes = overview ? material.nodes : path.map(id => material.nodes.find(n => n.id === id)!);
  return <div className={styles.flow}><div className={styles.flowControls}><button className={styles.secondary} onClick={() => setOverview(v => !v)} aria-pressed={overview}>{overview ? "Walk through" : "See full tree"}</button><button className={styles.secondary} onClick={() => { setPath([material.start]); setChoices({}); }}><RotateCcw size={18} />Start over</button></div>
    {nodes.map((n, i) => <React.Fragment key={n.id}>{i > 0 && <ArrowDown className={styles.flowArrow} size={24} />}<section className={styles.flowNode}><span className={styles.overline}>Step {material.nodes.indexOf(n) + 1}</span><h3>{n.question}</h3><p className={styles.authority}>{n.authority}</p><div className={styles.flowBranches}>{n.branches.map((b, j) => overview ? <div key={j}><b>{b.label}</b><p>{b.outcome ?? `Continue to step ${material.nodes.findIndex(n => n.id === b.next) + 1}`}</p></div> : <button key={j} aria-pressed={choices[n.id] === j} onClick={() => { setChoices(prev => Object.fromEntries([...path.slice(0, i).map(id => [id, prev[id]]), [n.id, j]])); setPath([...path.slice(0, i + 1), ...(b.next ? [b.next] : [])]); }}>{b.label}<ArrowRight size={18} /></button>)}</div>{!overview && n.branches[choices[n.id]]?.outcome && <p className={styles.flowOutcome} role="status">{n.branches[choices[n.id]].outcome}</p>}</section></React.Fragment>)}
  </div>;
}

function SortingDrill({ material }: { material: Extract<StudyMaterial, { kind: "drill" }> }) {
  const log = useLogStudy();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  return <div className={styles.drill}><p>{material.prompt}</p>{material.items.map((item, i) => <section key={i} className={styles.drillItem}><h3>{item.statement}</h3><div className={styles.sortChoices}>{material.categories.map(c => <button key={c} disabled={answers[i] !== undefined} aria-pressed={answers[i] === c} onClick={() => { haptic(); log("drill", `${material.id}:${i}`, c === item.answer); setAnswers(p => ({ ...p, [i]: c })); }}>{c}</button>)}</div>{answers[i] !== undefined && <div className={styles.drillResult} role="status"><b>{answers[i] === item.answer ? "Correct" : `Answer: ${item.answer}`}</b><p>{item.why}</p><p className={styles.authority}>{item.authority}</p></div>}</section>)}<button className={styles.secondary} onClick={() => setAnswers({})}><RotateCcw size={19} />Reset drill</button></div>;
}

function HypotheticalView({ material, store }: { material: Extract<StudyMaterial, { kind: "hypothetical" }>; store: Store }) {
  const [revealed, setRevealed] = useState(false);
  return <div className={styles.hypo}><p>{material.facts}</p><h3>{material.prompt}</h3><label>Your analysis<textarea value={store.record.notes[material.id] ?? ""} onChange={e => { const value = e.target.value; store.update(p => ({ ...p, notes: { ...p.notes, [material.id]: value } })); }} /></label><button className={styles.primary} onClick={() => setRevealed(v => !v)} aria-expanded={revealed}>{revealed ? "Hide analysis" : "Reveal analysis"}<ArrowRight size={19} /></button>{revealed && <div>{material.answer.map((a, i) => <section key={i} className={styles.modelAnswer}><h3>{a.issue}</h3><p>{a.analysis}</p><p className={styles.authority}>{a.authority}</p></section>)}</div>}</div>;
}
