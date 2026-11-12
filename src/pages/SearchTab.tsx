import { ChevronRight, Search, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { hasTool } from "../components/ToolHost";
import type { QuestionDTO } from "../endpoints/state_GET.schema";
import { haptic } from "../helpers/haptics";
import {
  buildSearchIndex,
  searchIndex,
  searchSuggestions,
  SEARCH_KINDS,
  type NoteItem,
  type SearchItem,
  type SearchKind,
  type SearchResult,
  type TaskItem,
} from "../helpers/searchIndex";
import {
  COURSES,
  COURSE_KEYS,
  type CourseCode,
  type Syllabus,
} from "../helpers/studyEngine";
import {
  SCHOOL_COURSES,
  SCHOOL_ORDER,
  type SchoolCourse,
  type StudyMaterial,
} from "../helpers/studyMaterials";
import type { WrittenEntry } from "../helpers/useWritten";
import { useWide } from "../helpers/useWide";
import styles from "./SearchTab.module.css";

const RECENT_KEY = "lawstin-recent-searches";
const MAX_RECENT = 8;

const readRecentSearches = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRecentSearch = (term: string) => {
  const clean = term.trim();
  if (!clean) return;
  try {
    const list = readRecentSearches().filter((x) => x.toLowerCase() !== clean.toLowerCase());
    const updated = [clean, ...list].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    /* storage unavailable */
  }
};

const clearRecentSearchesStorage = () => {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* storage unavailable */
  }
};

type Props = {
  questions: QuestionDTO[];
  materials: StudyMaterial[];
  syllabus: Syllabus;
  tasks?: TaskItem[];
  essays?: WrittenEntry[];
  notes?: NoteItem[];
  onTopic: (course: CourseCode, unit: string) => void;
  onRule: (course: CourseCode, topic?: string) => void;
  onEssay: (entry: WrittenEntry) => void;
  initialQuery?: string;
};

export function SearchTab({
  questions,
  materials,
  syllabus,
  tasks = [],
  essays = [],
  notes = [],
  onTopic,
  onRule,
  onEssay,
  initialQuery = "",
}: Props) {
  const wide = useWide();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [courseFilter, setCourseFilter] = useState<"all" | SchoolCourse>("all");
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Desktop focus on arrival
  useEffect(() => {
    if (wide) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [wide]);

  // One search index built in memory from loaded data
  const index = useMemo(
    () =>
      buildSearchIndex({
        questions,
        materials,
        syllabus,
        tasks,
        essays,
        notes,
      }),
    [questions, materials, syllabus, tasks, essays, notes]
  );

  // Run search
  const results = useMemo(
    () => (query.trim() ? searchIndex(index, query, courseFilter) : []),
    [index, query, courseFilter]
  );

  // Group results by kind in standard order
  const groupedResults = useMemo(() => {
    const map = new Map<SearchKind, SearchResult[]>();
    for (const r of results) {
      const k = r.item.kind;
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return SEARCH_KINDS.map((kind) => ({
      kind,
      items: map.get(kind) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [results]);

  // Flattened items in display order for arrow key navigation
  const flatItems = useMemo(
    () => groupedResults.flatMap((g) => g.items),
    [groupedResults]
  );

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(0);
    }
  }, [flatItems.length, selectedIndex]);

  // Suggestions when no results
  const suggestions = useMemo(() => {
    if (!query.trim() || results.length > 0) return [];
    return searchSuggestions(index, query, 5);
  }, [index, query, results.length]);

  const selectQuery = (q: string) => {
    haptic();
    setQuery(q);
    saveRecentSearch(q);
    setRecent(readRecentSearches());
    inputRef.current?.focus();
  };

  const clearRecent = () => {
    haptic();
    clearRecentSearchesStorage();
    setRecent([]);
  };

  const handleOpenItem = (item: SearchItem) => {
    haptic();
    saveRecentSearch(query);
    setRecent(readRecentSearches());

    switch (item.kind) {
      case "Rules": {
        const q = item.raw as QuestionDTO;
        onRule(q.course, q.topic);
        break;
      }
      case "Flashcards":
      case "Flowcharts":
      case "Rule reviews":
      case "Comparisons":
      case "Sorting drills":
      case "Hypotheticals": {
        const mat = item.raw as StudyMaterial;
        window.location.hash = `#/courses/${mat.course}/${mat.kind}/${mat.id}`;
        break;
      }
      case "Topics": {
        const topicRaw = item.raw as { course: CourseCode; unit: string };
        if (hasTool("Topic")) {
          window.location.hash = `#/tool/Topic/${topicRaw.course}/${encodeURIComponent(topicRaw.unit)}`;
        } else {
          onTopic(topicRaw.course, topicRaw.unit);
        }
        break;
      }
      case "Tasks": {
        const t = item.raw as TaskItem;
        window.location.hash = `#/courses/${t.course}`;
        break;
      }
      case "Essays": {
        const essay = item.raw as WrittenEntry;
        onEssay(essay);
        break;
      }
      case "Notes": {
        break;
      }
    }
  };

  // Keyboard navigation: Arrow keys & Enter, Escape clears/blurs
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (query) {
        setQuery("");
      } else {
        inputRef.current?.blur();
      }
      return;
    }

    if (!flatItems.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1 < flatItems.length ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 >= 0 ? i - 1 : flatItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = flatItems[selectedIndex];
      if (current) {
        handleOpenItem(current.item);
      }
    }
  };

  const highlightedItem = flatItems[selectedIndex]?.item ?? null;

  return (
    <div className={styles.searchView}>
      {/* Search Input Bar */}
      <div className={styles.searchBar}>
        <Search size={20} className={styles.searchIcon} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label="Search rules, materials, and topics"
          placeholder="Search rules, topics, cards, and tasks"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            className={styles.clearButton}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Course Filter Chips */}
      <div className={styles.filterChips} role="group" aria-label="Filter by course">
        <button
          type="button"
          aria-pressed={courseFilter === "all"}
          className={`${styles.chip} ${courseFilter === "all" ? styles.chipActive : ""}`}
          onClick={() => {
            haptic();
            setCourseFilter("all");
          }}
        >
          All
        </button>
        {SCHOOL_ORDER.map((c) => {
          const active = courseFilter === c;
          const info = SCHOOL_COURSES[c];
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              onClick={() => {
                haptic();
                setCourseFilter(c);
              }}
            >
              <span className={styles.courseDot} style={{ background: info.color }} />
              {info.short}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {!query.trim() ? (
        /* Before typing: Recent searches and browsable course units */
        <div className={styles.searchView}>
          {recent.length > 0 && (
            <section className={styles.recentSection}>
              <div className={styles.recentHeader}>
                <span className={styles.recentTitle}>Recent searches</span>
                <button
                  type="button"
                  className={styles.clearRecentBtn}
                  onClick={clearRecent}
                  aria-label="Clear recent searches"
                >
                  Clear
                </button>
              </div>
              <div className={styles.recentChips}>
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className={styles.recentChip}
                    onClick={() => selectQuery(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={styles.browseSection}>
            <h2 className={styles.browseHeader}>Courses and units</h2>
            <div className={styles.courseBrowseList}>
              {COURSE_KEYS.map((c) => {
                const info = COURSES[c];
                const units = syllabus[c] ?? [];
                if (!units.length) return null;
                return (
                  <div key={c} className={styles.courseUnitsCard}>
                    <div className={styles.courseUnitsHead}>
                      <span className={styles.courseDot} style={{ background: info.color }} />
                      <span>{info.name}</span>
                    </div>
                    <div className={styles.courseUnitsList}>
                      {units.map((u) => (
                        <button
                          key={u.topic}
                          type="button"
                          className={styles.unitRow}
                          onClick={() => {
                            haptic();
                            if (hasTool("Topic")) {
                              window.location.hash = `#/tool/Topic/${c}/${encodeURIComponent(u.topic)}`;
                            } else {
                              onTopic(c, u.topic);
                            }
                          }}
                        >
                          <div className={styles.unitRowMain}>
                            <span className={styles.unitTitle}>{u.topic}</span>
                            {u.dates?.length ? (
                              <span className={styles.unitDates}>{u.dates.join(", ")}</span>
                            ) : null}
                          </div>
                          <ChevronRight size={18} className={styles.chevron} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : results.length === 0 ? (
        /* No results: query and nearby suggestions */
        <div className={styles.noResults}>
          <div className={styles.noResultsHeading}>Suggestions for “{query}”</div>
          {suggestions.length > 0 && (
            <div className={styles.suggestionChips}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.suggestionChip}
                  onClick={() => selectQuery(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : wide ? (
        /* Desktop 2-column layout */
        <div className={styles.desktopSplit}>
          <div className={styles.leftCol}>
            <div className={styles.resultsContainer}>
              {groupedResults.map((group) => (
                <div key={group.kind} className={styles.kindGroup}>
                  <div className={styles.kindGroupHead}>
                    <span className={styles.kindTitle}>{group.kind}</span>
                    <span className={styles.kindCount}>{group.items.length}</span>
                  </div>
                  <div className={styles.resultList}>
                    {group.items.map((res) => {
                      const flatIndex = flatItems.indexOf(res);
                      const isSelected = flatIndex === selectedIndex;
                      const courseInfo = SCHOOL_COURSES[res.item.course];
                      return (
                        <button
                          key={res.item.id}
                          type="button"
                          className={`${styles.resultRow} ${isSelected ? styles.resultRowActive : ""}`}
                          onClick={() => handleOpenItem(res.item)}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                        >
                          <span
                            className={styles.courseDot}
                            style={{ background: courseInfo.color }}
                          />
                          <div className={styles.resultMain}>
                            <div className={styles.resultHeader}>
                              <span className={styles.resultTitle}>{res.item.title}</span>
                              {res.item.authority && (
                                <span className={styles.resultAuthority}>
                                  {res.item.authority}
                                </span>
                              )}
                            </div>
                            <div className={styles.resultSnippet}>
                              {res.snippetTokens.map((t, idx) =>
                                t.match ? (
                                  <mark key={idx}>{t.text}</mark>
                                ) : (
                                  <span key={idx}>{t.text}</span>
                                )
                              )}
                            </div>
                          </div>
                          <ChevronRight size={18} className={styles.chevron} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop Preview Column */}
          {highlightedItem && (
            <div className={styles.previewPane}>
              <div className={styles.previewHeader}>
                <div className={styles.previewBadgeRow}>
                  <span className={styles.previewBadge}>{highlightedItem.kind}</span>
                  <span className={styles.previewCourse}>
                    <span
                      className={styles.courseDot}
                      style={{ background: SCHOOL_COURSES[highlightedItem.course].color }}
                    />
                    {SCHOOL_COURSES[highlightedItem.course].short}
                  </span>
                </div>
                <div className={styles.previewTitle}>{highlightedItem.title}</div>
                {highlightedItem.authority && (
                  <div className={styles.previewAuthority}>{highlightedItem.authority}</div>
                )}
              </div>
              <div className={styles.previewBody}>{highlightedItem.body}</div>
              <div className={styles.previewAction}>
                <Button size="md" variant="primary" onClick={() => handleOpenItem(highlightedItem)}>
                  Open
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Mobile single-column grouped layout */
        <div className={styles.resultsContainer}>
          {groupedResults.map((group) => (
            <div key={group.kind} className={styles.kindGroup}>
              <div className={styles.kindGroupHead}>
                <span className={styles.kindTitle}>{group.kind}</span>
                <span className={styles.kindCount}>{group.items.length}</span>
              </div>
              <div className={styles.resultList}>
                {group.items.map((res) => {
                  const courseInfo = SCHOOL_COURSES[res.item.course];
                  return (
                    <button
                      key={res.item.id}
                      type="button"
                      className={styles.resultRow}
                      onClick={() => handleOpenItem(res.item)}
                    >
                      <span
                        className={styles.courseDot}
                        style={{ background: courseInfo.color }}
                      />
                      <div className={styles.resultMain}>
                        <div className={styles.resultHeader}>
                          <span className={styles.resultTitle}>{res.item.title}</span>
                          {res.item.authority && (
                            <span className={styles.resultAuthority}>
                              {res.item.authority}
                            </span>
                          )}
                        </div>
                        <div className={styles.resultSnippet}>
                          {res.snippetTokens.map((t, idx) =>
                            t.match ? (
                              <mark key={idx}>{t.text}</mark>
                            ) : (
                              <span key={idx}>{t.text}</span>
                            )
                          )}
                        </div>
                      </div>
                      <ChevronRight size={18} className={styles.chevron} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
