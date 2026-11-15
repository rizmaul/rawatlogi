import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPrompts, taskInstructions } from "../shared/prompts";

// Guards the safety rules that the "science friend" voice depends on.
test("writing voice keeps the three-tier claim rules and link contract", () => {
  const v = defaultPrompts.voice;
  assert.match(v, /General science/);
  assert.match(v, /ONLY from approvedEvidence/);
  assert.match(v, /Product results[\s\S]*NEVER/);
  assert.match(v, /do not repeat seller benefit claims/);
  assert.match(v, /Never invent personal use/);
  assert.match(v, /exactly once/);
  assert.match(v, /disclosure/);
  // Tone examples use an unrelated fictional product so wording cannot leak into real posts.
  assert.match(v, /Sora Daily UV Fluid/);
});

test("expanded writer and editor prompts contain the voice and no unresolved placeholders", () => {
  const t = taskInstructions();
  for (const text of [t.writing, t.writingEdit]) {
    assert.ok(text.includes("VOICE — WHO WRITES THIS"));
    assert.ok(!text.includes("{{"));
  }
  assert.ok(defaultPrompts.jsonSuffix.includes("{{schema}}"));
});
