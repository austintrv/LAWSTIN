---
name: review-packet
description: Create printable five-part law school review packets from assigned readings, outlines, briefs, slides, and class notes. Use for requests for a study packet or multi-section practice worksheet on one topic or across a course, or for a LAWSTIN packet, LAWSTIN export, or packet to upload to LAWSTIN.
---

# Law school review packets

Give the student a worksheet they can attempt closed-book and grade themselves. Use the course, scope, sources, length, and delivery format they specify. Default to printable Markdown in chat. If scope is genuinely unclear, ask whether they want one focused topic or a broader review. If the necessary course materials are missing, ask for them.

## Plan the coverage

Before drafting, map each major topic to its learning objectives, source passages, and planned question numbers. For a focused packet, do this for its principal subtopics. Give each topic two distinct tasks: produce a rule, element, or distinction from memory, then apply it to facts or distinguish it from a competing doctrine. A mention, an answer choice, or a matching pair alone does not earn either assignment. Count an integrated question toward two topics only if the student must actually reason through both.

Start with comparable practice for topics of comparable importance. Allocate extra questions for explicit professor emphasis or independently testable elements and exceptions. Page count, boldface, and the availability of a colorful case can mislead. Interleave topics within parts. If the default length would leave a topic thin, change the section counts or divide the scope into labeled, complete packets. Honor a hard length limit and identify any deferred coverage. Check the finished questions against the map.

## Build the worksheet

Open with the course, scope, and a short instruction line. Use five parts in this order. The usual counts below total 25 numbered items. Number continuously and leave writing space between items.

1. **Matching** (5). Use a two-column table with numbered, bold terms and shuffled, lettered definitions. Choose cases, treaty terms, provisions, or doctrines as the material warrants. For an early closed-book recall task, invite the student to cover the definition column and supply a rule from a term before matching. A recall task counted toward coverage must explicitly say what to produce and have a corresponding answer in the key.
2. **True or false and repair** (7). Provide True and False checkboxes. Ask the student to replace the fewest words needed to make each false statement true. Use meaningful distinctions and a natural mix of answers. Give each false statement a clear, repairable error. For a true statement, a short justification can test reasoning.
3. **Direct-rule multiple choice** (5). Ask about the precise element, standard, actor, burden, or exception. A short write-in before revealing the options can supply unaided recall. Put any prompts that require fresh recall before wording elsewhere that would supply the answer.
4. **Hypothetical multiple choice** (5). Write concise fact patterns with enough facts for one best answer. Mix original problems with adaptations of assigned cases when the materials support both. In an adaptation, preserve the legally decisive facts, jurisdiction, and posture. For an invented variation, work out the result under the assigned rule. Identify its relationship to the source in the key.
5. **Short response** (3). Ask for two to five sentences. Revisit core rules through a different task. Work one playful challenge into an existing item and vary the format across packets when prior examples are available. In *Flip the result*, ask for the outcome and the smallest fact change that strengthens the other side. In *Fix the group chat*, ask for a precise edit to a classmate's confident mistake. In *You're the professor*, ask for a follow-up question that exposes a missing element and what a good answer would say. Keep the fun in the situation and the intellectual move.

Before the STOP line, include a short **Try tomorrow** box. Give a few fresh, closed-book prompts for the core rules, such as reconstructing a test or identifying the decisive fact in a new example. Put their answers after STOP. Space encounters with the same rule across recall, application, and later retrieval. Avoid recycling identical questions.

## Write and check the choices

For each multiple-choice item, write one defensible best answer and three plausible mistakes a prepared student might make. For example, assign the burden to the wrong party, apply a neighboring test, or overlook an exception that the facts actually trigger. Each option should answer the same question, in parallel grammar, at comparable length and specificity. Move shared qualifications into the stem. Preserve legally necessary distinctions.

Read the choices for wording alone. Look for the uniquely long or careful answer, a phrase echoed from the stem, a grammatical fit, a lone citation, a joke, or absolutes confined to wrong choices. Read the student-facing packet in order. If an earlier item explicitly states the answer to a later one, rewrite the later item to require a fresh decision. For example, after students identify who can authorize an activity, have them decide whether a particular authorization covers a new act. If a short source offers no further distinction, use fewer questions. Then shuffle options and distribute correct letters across A–D without a predictable cycle (normally two or three of each across ten items). Check final letters after every reorder.

## Double-check before delivery

1. **Verify the law against the assigned material.** Inspect the passage supporting each keyed proposition, including corrections, distractor explanations, challenge answers, and next-day prompts. For a case holding, read the assigned opinion or excerpt and distinguish the holding from dicta, a dissent, and the parties' arguments. State material limits such as jurisdiction or treaty version. Record an actual page, slide, section, timestamp, or identifiable heading for the key. If sources conflict or the passage needed for a claim is unavailable, briefly identify the gap to the student and replace the scored item with one supported by the material. Never invent a locator or claim to have inspected an unavailable authority.
2. **Solve the finished worksheet afresh.** Set aside the draft key and solve from the student-facing wording. For each hypothetical, identify the decisive fact. For each multiple-choice item, explain why the strongest rival fails and look for a missing fact that could make it defensible. Repair or replace ambiguous items and recheck them against the source. Compare the final letters to the actual answer texts, including matching pairs. Accept other legally sufficient repairs or fact changes in open-ended items. Reconcile the finished topic index with the actual questions.

## Give the student a usable key

Insert **STOP. Finish the worksheet before opening the answer key.** Place explanations, source locators, and case identifications below it.

- **Matching:** Give the letter, the matched meaning, and any requested recall answer.
- **True or false:** Explain each verdict. Print the full corrected sentence for every false statement.
- **Multiple choice:** Give the letter and answer text, then the rule and the fact or distinction that resolves the question. Explain each distractor's specific error by letter. For a case adaptation, identify the case and its verified holding. Label invented variations and distinguish the modeled outcome from the court's actual decision.
- **Short response and Try tomorrow:** Give concise model answers and identify what earns credit, including why a proposed change matters. Label a new fact as invented when comparing it with an assigned case.
- Put a source locator beside each answer. A single locator can support several sentences when the same passage supports all of them. End with a compact topic index. Map every numbered item to its topic and task (for example, recall, rule recognition, or application). A student should be able to find every question on a missed topic and see where they practiced both recall and application.

## LAWSTIN export

Keep printable Markdown as the default. For an explicit “LAWSTIN packet,” “LAWSTIN export,” or “packet I can upload to LAWSTIN,” deliver one downloadable file named for the topic with the suffix `.lawstin-packet.json`. When file output is unavailable, return one complete JSON code block the student can save with that suffix.

Apply the same coverage plan, closed-book sequencing, rotating challenges, choice audits and both accuracy passes above. Use the bundled [v1 schema](references/packet.schema.json) as the format contract. Include each of the five section kinds once in worksheet order, with flexible question counts. Give every question and next-day prompt a unique permanent ID, and each choice or definition a stable ID within its bank. Set correctId to the ID, never a display position. For false statements supply repair.model (the full corrected sentence) and repair.criteria. Put a matching term's recall in its question. Record all relevant topics and tasks. Keep case identification, source locators, models, criteria and option explanations in the review fields. Student-facing text must stand on its own after shuffling.

Run `node references/check.mjs PATH/TO/file.lawstin-packet.json` from this skill folder with Node 22 or newer whenever available. Correct each error and repeat on the final delivery file. If unavailable, check the schema, unique IDs, references, and false-statement repairs manually. Never report a validator run you did not perform.
