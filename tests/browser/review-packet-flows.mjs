import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { open, closeAll } from "./mock.mjs";

const sample = fileURLToPath(
  new URL("../../content/review-packets/motion-deadlines.lawstin-packet.json", import.meta.url),
);
const broken = JSON.parse(readFileSync(sample, "utf8"));
broken.sections[2].questions[0].correctId = "missing";
const s = await open({ hash: "#/courses/tutoring" });
try {
  const p = s.page;
  p.setDefaultTimeout(10000);
  const btn = (name) => p.getByRole("button", { name, exact: true });
  const upload = async (file) => {
    const chooser = p.waitForEvent("filechooser");
    await btn("Import review packet").click();
    await (await chooser).setFiles(file);
  };
  await upload({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(broken)),
  });
  await p.getByText(/Question 5 .*existing option/).waitFor();
  assert.equal(await btn("Save to course").count(), 0);
  assert.equal(s.settingWrites.filter((r) => r.key.startsWith("packet:v1")).length, 0);
  await upload(sample);
  await p.getByText("Match the terms · 2", { exact: true }).waitFor();
  await btn("Save to course").click();
  const card = (id) => p.locator("#packet-question-" + id);
  const next = () => btn("Next section").click();
  const source = p.getByText(/Practice Order 7 \(fictional\), § 1/);
  assert.equal(await source.count(), 0);
  assert.equal(await p.getByLabel("Definition", { exact: true }).count(), 0);
  await card("trigger").getByRole("textbox").pressSequentially("Exclude service day");
  await btn("Reveal definition bank").click();
  const matching = card("trigger").getByRole("combobox");
  await matching.focus();
  await p.keyboard.press("Home");
  // Type-ahead on the native select also works when the bank is shuffled.
  await p.keyboard.type("The date notice");
  assert.equal(await matching.inputValue(), "service");
  await card("last").getByRole("combobox").selectOption("service");
  const bank = await card("trigger").locator("option").allTextContents();
  await p.reload();
  await card("trigger").waitFor();
  assert.deepEqual(await card("trigger").locator("option").allTextContents(), bank);
  assert.equal(await card("trigger").getByRole("textbox").inputValue(), "Exclude service day");
  assert.equal(await card("last").getByRole("combobox").inputValue(), "service");
  await next();
  await card("inside").getByRole("radio", { name: "False" }).check();
  await card("inside").getByLabel("Repair the statement").fill("Only weekdays count");
  await card("monday").getByRole("radio", { name: "True", exact: true }).check();
  await card("monday").getByRole("textbox").fill("The endpoint is on a weekend.");
  await next();
  assert.equal(await card("count").getByRole("radio").count(), 0);
  await card("count").getByRole("textbox").fill("Exclude trigger day, count calendar days");
  await btn("Reveal choices").click();
  const radios = card("count").locator("fieldset label");
  const order = await radios.allTextContents();
  await card("count").getByLabel("Start after service and count calendar days.").check();
  await p.reload();
  await card("count").waitFor();
  assert.deepEqual(await radios.allTextContents(), order);
  assert.equal(
    await card("count").getByLabel("Start after service and count calendar days.").isChecked(),
    true,
  );
  await next();
  await card("motion").getByText("Notice is served Thursday.", { exact: false }).waitFor();
  await card("motion").getByLabel("Monday", { exact: true }).check();
  await next();
  await p.getByText("1 unanswered or incomplete", { exact: true }).waitFor();
  await card("flip").getByRole("textbox").fill("Thursday. Shift service two days forward.");
  await p.getByText("0 unanswered or incomplete", { exact: true }).waitFor();
  assert.equal(await source.count(), 0);
  await btn("Submit packet").click();
  await p.getByText("5 of 6 objective answers correct · 5 pending self-review").waitFor();
  await card("last").getByText("Incorrect", { exact: true }).waitFor();
  await card("inside").getByText("Correct", { exact: true }).waitFor();
  await card("inside").getByText("Only weekdays count", { exact: true }).waitFor();
  await card("inside").getByLabel("Self-review").selectOption("Needs practice");
  await p.getByText(/4 pending self-review/).waitFor();
  await card("motion")
    .getByText(/Tuesday follows only if/)
    .waitFor();
  assert.equal(await source.count(), 7);
  await p.getByText("Topic index", { exact: true }).click();
  await btn("Question 7 · application").click();
  await p.waitForFunction(() => document.activeElement.id === "packet-question-flip");
  await btn("Start fresh attempt").click();
  const answer = p.getByRole("region", { name: "Review packets" }).getByRole("textbox");
  await answer.fill("Count Saturday through Tuesday");
  await btn("Review this attempt").click();
  await p.getByText("Count Saturday through Tuesday", { exact: true }).waitFor();
  await btn("Back to packet").click();
  await btn("Start fresh attempt").click();
  assert.equal(await answer.inputValue(), "");
  await answer.fill("Second try");
  await p.reload();
  await btn("Resume attempt 2").click();
  assert.equal(await answer.inputValue(), "Second try");
  await btn("Back to packet").click();
  await btn("Review attempt 1").click();
  await p.getByText("Count Saturday through Tuesday", { exact: true }).waitFor();
  await btn("Back to packet").click();
  assert.equal(await card("inside").getByLabel("Self-review").inputValue(), "Needs practice");
  const savedUrl = p.url();
  await p.waitForFunction(() => !Object.keys(JSON.parse(localStorage.getItem("lawstin-cache:settings-pending") ?? "{}")).some(k => k.startsWith("packet:v1:")));
  const stored = s.rows.filter(r => r.key.startsWith("packet:v1:tutoring:"));
  assert.equal(stored.length, 1);
  assert.deepEqual(JSON.parse(stored[0].value).packet, JSON.parse(readFileSync(sample, "utf8")));
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("lawstin-cache:packet:v1:")) localStorage.removeItem(k);
  });
  await p.reload();
  await card("inside").getByLabel("Self-review").waitFor();
  assert.equal(await card("inside").getByLabel("Self-review").inputValue(), "Needs practice");
  await btn("Back to course").click();
  await upload({name:"invalid-again.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(broken))});
  await p.getByText(/Question 5 .*existing option/).waitFor();
  assert.deepEqual(s.rows.filter(r => r.key.startsWith("packet:v1:tutoring:")), stored);
  await btn("When is the motion due? · Review results").click();
  await p.waitForURL(savedUrl);
  assert.equal(s.answers.length, 0);
  assert.deepEqual(s.errors, []);
  console.log(
    "Verified upload, atomic rejection, resume, grading, topic navigation and independent revisit history.",
  );
} finally {
  await s.close();
  await closeAll();
}
