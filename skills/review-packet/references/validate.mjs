// Both the app and the standalone CLI use this exact schema and reference check.
import schema from "./packet.schema.json" with { type: "json" };

function check(rule, value, path) {
  const fail = (message) => {
    throw new Error(path + ": " + message);
  };
  if (rule.$ref) return check(schema.$defs[rule.$ref.split("/").pop()], value, path);
  if (rule.oneOf) {
    const variant = rule.oneOf.find(
      (r) => schema.$defs[r.$ref.split("/").pop()].properties.kind.const === value?.kind,
    );
    if (!variant) fail("Choose a supported section kind.");
    return check(variant, value, path);
  }
  if ("const" in rule && rule.const !== value) fail("Expected " + JSON.stringify(rule.const) + ".");
  if (rule.enum && !rule.enum.includes(value)) fail("Use one of " + rule.enum.join(", ") + ".");
  if (rule.type === "array") {
    if (!Array.isArray(value) || value.length < rule.minItems || value.length > (rule.maxItems ?? Infinity))
      fail(
        "Expected " +
          (rule.maxItems === rule.minItems ? "exactly " : "at least ") +
          rule.minItems +
          " entries.",
      );
    for (const constraint of rule.allOf ?? []) {
      const kind = constraint.contains.properties.kind.const;
      const count = value.filter((item) => item?.kind === kind).length;
      if (count < constraint.minContains || count > constraint.maxContains)
        fail("Include the " + kind + " section exactly once.");
    }
    value.forEach((item, i) => check(rule.items, item, path + "[" + (i + 1) + "]"));
  } else if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected an object.");
    const conditional = rule.if && Object.entries(rule.if.properties).every(([k, r]) => value[k] === r.const);
    const required = conditional ? [...rule.required, ...rule.then.required] : rule.required;
    for (const key of required) if (!Object.hasOwn(value, key)) fail('Add the missing field "' + key + '".');
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(rule.properties, key)) fail('Remove the unknown field "' + key + '".');
      check(rule.properties[key], item, path + "." + key);
    }
  } else if (rule.type && typeof value !== rule.type) fail("Expected " + rule.type + ".");
  if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail("Use text matching " + rule.pattern + ".");
}

export function validatePacket(value) {
  check(schema, value, "Packet");
  function unique(ids, where) {
    if (new Set(ids).size !== ids.length) throw new Error(where + ": use unique IDs.");
  }
  const questionIds = value.tomorrow.map((p) => p.id);
  let number = 0;
  for (const section of value.sections) {
    if (section.definitions)
      unique(
        section.definitions.map((d) => d.id),
        section.title + " definitions",
      );
    for (const q of section.questions) {
      number++;
      questionIds.push(q.id);
      const choices = q.choices ?? section.definitions;
      if (choices) {
        unique(
          choices.map((c) => c.id),
          "Question " + number + " options",
        );
        if (!choices.some((c) => c.id === q.correctId))
          throw new Error(
            "Question " + number + " (" + q.id + "): correctId must point to an existing option.",
          );
      }
    }
  }
  unique(questionIds, "Questions and Try tomorrow prompts");
  return value;
}
