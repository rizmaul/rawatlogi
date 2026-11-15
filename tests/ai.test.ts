import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callAI,
  defaultAPIConfig,
  extractAIText,
  apiConfigSchema,
} from "../shared/ai";
test("streaming retains only final output and rejects interrupted streams", async () => {
  const chunks =
    [
      {
        choices: [
          {
            delta: { reasoning_content: "private internal reasoning" },
            finish_reason: null,
          },
        ],
      },
      { choices: [{ delta: { content: '{"ok":' }, finish_reason: null }] },
      { choices: [{ delta: { content: "true}" }, finish_reason: "stop" }] },
      { choices: [], usage: { output_tokens: 15 } },
    ]
      .map((item) => "data: " + JSON.stringify(item) + "\n\n")
      .join("") + "data: [DONE]\n\n";
  const value = await callAI(
    { ...defaultAPIConfig, protocol: "chat-completions", apiKey: "test" },
    "Return JSON",
    {},
    {},
    (async () =>
      new Response(chunks, {
        headers: { "Content-Type": "text/event-stream" },
      })) as any,
  );
  assert.deepEqual(value.result, { ok: true });
  assert.equal(
    JSON.stringify(value).includes("private internal reasoning"),
    false,
  );
  await assert.rejects(
    () =>
      callAI(
        { ...defaultAPIConfig, protocol: "chat-completions", apiKey: "test" },
        "x",
        {},
        {},
        (async () =>
          new Response('data: {"choices":[{"delta":{"content":"{"}}]}\n\n', {
            headers: { "Content-Type": "text/event-stream" },
          })) as any,
      ),
    /ended before/,
  );
});
test("Responses requests use the exact configured model and max effort without exposing reasoning", async () => {
  let captured: any;
  const mock = async (url: any, init: any) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "reasoning",
            content: [{ type: "reasoning_text", text: "private reasoning" }],
          },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: '{"ok":true}' }],
          },
        ],
        usage: { output_tokens: 20 },
      }),
      { status: 200 },
    );
  };
  const answer = await callAI(
    { ...defaultAPIConfig, apiKey: "test-only" },
    "Return JSON",
    { test: true },
    { type: "object" },
    mock as any,
  );
  assert.equal(captured.url, "https://rkapi.com/v1/responses");
  assert.equal(captured.body.model, "deepseek-v4.1-flash");
  assert.equal(captured.body.reasoning.effort, "max");
  assert.equal(captured.init.redirect, "error");
  assert.deepEqual(answer.result, { ok: true });
  assert.equal(captured.body.store, false);
});
test("Chat compatibility is explicit and also requests max effort", async () => {
  let body: any;
  const mock = async (_: any, init: any) => {
    body = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: '{"ok":true}' }, finish_reason: "stop" },
        ],
      }),
    );
  };
  await callAI(
    { ...defaultAPIConfig, protocol: "chat-completions", apiKey: "test" },
    "Return JSON",
    {},
    {},
    mock as any,
  );
  assert.equal(body.reasoning_effort, "max");
});
test("provider failures are sanitized, incomplete answers are rejected", async () => {
  await assert.rejects(
    () =>
      callAI(
        { ...defaultAPIConfig, apiKey: "secret-marker" },
        "x",
        {},
        {},
        (async () =>
          new Response("secret-marker sensitive error", {
            status: 401,
          })) as any,
      ),
    (e) =>
      e instanceof Error &&
      e.message.includes("401") &&
      !e.message.includes("secret-marker"),
  );
  assert.throws(
    () => extractAIText({ status: "incomplete" }, "responses"),
    /incomplete/,
  );
  await assert.rejects(
    () =>
      callAI(
        { ...defaultAPIConfig, apiKey: "test" },
        "x",
        {},
        {},
        (async () =>
          new Response(JSON.stringify({ output_text: "not JSON" }))) as any,
      ),
    /valid JSON/,
  );
});
test("provider endpoints reject local hosts, credentials, and non-HTTPS URLs", () => {
  for (const baseUrl of [
    "http://rkapi.com/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://user:password@example.com/v1",
    "https://api.internal/v1",
  ])
    assert.equal(
      apiConfigSchema.safeParse({ ...defaultAPIConfig, baseUrl }).success,
      false,
    );
});
