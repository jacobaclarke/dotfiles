import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { test } from "node:test";

// Use the installed Pi's dependencies, exactly as extensions do; no npm install.
const binary = process.env.PI_TEST_BINARY || execFileSync("which", ["pi"], { encoding: "utf8" }).trim();
const hostRequire = createRequire(realpathSync(binary));
const { createJiti } = hostRequire("jiti");
function hostImport(name) {
  const root = hostRequire.resolve.paths(name).map((path) => join(path, name))
    .find((path) => existsSync(join(path, "package.json")));
  assert.ok(root, `Pi dependency not found: ${name}`);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return resolve(root, manifest.exports?.["."]?.import || manifest.main);
}
const jiti = createJiti(import.meta.url, {
  alias: {
    "@earendil-works/pi-ai": hostImport("@earendil-works/pi-ai"),
    typebox: hostImport("typebox"),
  },
});
const { default: extension } = await jiti.import("../pi/goals.ts");

function harness(branch = [], startInPlan = false) {
  const commands = new Map(), events = new Map(), tools = new Map();
  let active = ["read", "bash", "write", "edit", "custom_tool", "update_plan"];
  const all = ["read", "grep", "find", "ls", "bash", "write", "edit", "custom_tool", "update_plan"];
  const messages = [], prompts = [], notices = [];
  let idle = true;
  const pi = {
    registerCommand: (name, def) => commands.set(name, def),
    registerFlag() {}, getFlag: () => startInPlan,
    on: (name, handler) => events.set(name, handler),
    registerTool: (def) => tools.set(def.name, def),
    getActiveTools: () => [...active],
    getAllTools: () => all.map((name) => ({ name })),
    setActiveTools: (names) => { active = [...names]; },
    appendEntry: (customType, data) => branch.push({ type: "custom", customType, data: structuredClone(data) }),
    sendMessage: (msg) => messages.push(msg),
    sendUserMessage: (msg) => prompts.push(msg),
  };
  const ctx = {
    hasUI: true, isIdle: () => idle,
    sessionManager: { getBranch: () => branch },
    ui: { setStatus() {}, notify: (message) => notices.push(message) },
  };
  extension(pi);
  events.get("session_start")({}, ctx);
  return {
    branch, ctx, messages, prompts, notices,
    active: () => [...active], busy: () => { idle = false; },
    command: (name, args = "") => commands.get(name).handler(args, ctx),
    event: (name, data = {}) => events.get(name)(data, ctx),
    update: (params) => tools.get("update_plan").execute("id", params, undefined, undefined, ctx),
    latest: () => branch.at(-1)?.data,
  };
}
const plan = [
  { step: "Implement the requested change", status: "pending" },
  { step: "Run focused checks", status: "pending" },
];

test("planning requires explicit execution and restores the exact prior tools", async () => {
  const h = harness();
  const original = h.active();
  await h.command("goal", "Ship the requested change");
  await h.command("plan");
  assert.deepEqual(h.active(), ["read", "grep", "find", "ls", "update_plan"]);
  const kickoffCount = h.prompts.length;
  await h.update({ plan });
  assert.equal(h.latest().mode, "planning");
  assert.equal(h.prompts.length, kickoffCount, "saving a plan must not launch implementation");
  await h.command("execute");
  assert.deepEqual(h.active(), original);
  assert.equal(h.latest().mode, "executing");
  assert.match(h.prompts.at(-1), /I approve/);
});

test("planning blocks shells, MCP, wrappers, unknown and dynamically activated tools", async () => {
  const h = harness();
  await h.command("plan");
  for (const name of ["bash", "powershell", "write", "edit", "mcp__send", "codemode", "tool_search", "custom_tool", "future_tool"]) {
    assert.equal(h.event("tool_call", { toolName: name }).block, true, name);
  }
  for (const name of ["read", "grep", "find", "ls", "update_plan"]) {
    assert.equal(h.event("tool_call", { toolName: name }), undefined, name);
  }
  assert.equal(h.event("user_bash").result.exitCode, 1);
});

test("plan off retains progress and does not execute or broaden the tool selection", async () => {
  const h = harness();
  const original = h.active();
  await h.command("goal", "A test outcome");
  await h.command("plan");
  await h.update({ plan });
  const count = h.prompts.length;
  await h.command("plan", "off");
  assert.deepEqual(h.active(), original);
  assert.equal(h.prompts.length, count);
  assert.equal(h.latest().plan.length, 2);
  assert.equal(h.event("tool_call", { toolName: "bash" }), undefined);
  assert.equal(h.event("user_bash"), undefined);
});

test("resume, reload and branch navigation recover only active-branch state", async () => {
  const h = harness();
  await h.command("goal", "Original goal");
  const goalBranch = structuredClone(h.branch);
  await h.command("plan");
  await h.update({ plan });
  const resumed = harness(structuredClone(h.branch));
  assert.equal(resumed.active().includes("bash"), false);
  assert.match(resumed.event("before_agent_start", { systemPrompt: "base" }).systemPrompt, /Original goal/);
  await resumed.command("execute");
  assert.equal(resumed.active().includes("custom_tool"), true);
  h.branch.splice(0, h.branch.length, ...goalBranch);
  h.event("session_tree");
  assert.equal(h.active().includes("bash"), true);
  await h.command("plan-status");
  assert.match(h.messages.at(-1).content, /Original goal/);
  assert.doesNotMatch(h.messages.at(-1).content, /Implement the requested change/);
  h.branch.length = 0;
  h.event("session_tree");
  assert.equal(h.event("before_agent_start", { systemPrompt: "base" }), undefined);
});

test("incomplete or completed plans do not start execution", async () => {
  const h = harness();
  await h.command("execute");
  assert.equal(h.prompts.length, 0);
  await assert.rejects(h.update({ plan }), /goal/);
  await h.update({ goal: "Done", plan: plan.map((item) => ({ ...item, status: "completed" })) });
  await h.command("execute");
  assert.equal(h.prompts.length, 0);
});

test("invalid semantic updates leave saved state intact", async () => {
  const h = harness();
  await h.update({ goal: "Verify change", plan });
  const saved = structuredClone(h.latest());
  await assert.rejects(h.update({ plan: [{ step: "  ", status: "pending" }] }), /blank/);
  await assert.rejects(h.update({ plan: plan.map((item) => ({ ...item, status: "in_progress" })) }), /one step/);
  assert.deepEqual(h.latest(), saved);
});

test("goal reset and busy-run guards", async () => {
  const h = harness();
  await h.command("goal", "Old goal");
  await h.command("plan");
  await h.command("goal", "clear");
  assert.equal(h.active().includes("bash"), true);
  assert.equal(h.latest().goal, "");
  assert.equal(h.latest().plan.length, 0);
  h.busy();
  await h.command("goal", "Do not set");
  await h.command("plan");
  await h.command("execute");
  assert.equal(h.latest().goal, "");
  assert.equal(h.prompts.length, 1, "only the earlier planning request started a run");
  assert.equal(h.notices.length, 3);
});

test("CLI planning restricts tools before the first request", async () => {
  const h = harness([], true);
  assert.equal(h.active().includes("bash"), false);
  assert.equal(h.event("tool_call", { toolName: "write" }).block, true);
  await h.command("plan", "off");
  assert.equal(h.active().includes("bash"), true);
});

test("progress is explicit, snapshots are independent, and large tool output is bounded", async () => {
  const h = harness();
  const result = await h.update({ goal: "Track progress", plan });
  await h.update({ plan: [{ ...plan[0], status: "completed" }, plan[1]], explanation: "Focused checks passed" });
  assert.equal(result.details.plan[0].status, "pending");
  assert.equal(h.latest().plan[0].status, "completed");
  const large = await h.update({ plan: Array.from({ length: 30 }, () => ({ step: "漢".repeat(500), status: "pending" })) });
  assert.match(large.content[0].text, /Output truncated/);
  assert.ok(Buffer.byteLength(large.content[0].text) < 50 * 1024);
  assert.equal(large.details.plan.length, 30);
});

test("planning context survives a new prompt without growing the base prompt", async () => {
  const h = harness();
  await h.command("plan", "Inspect the application");
  const first = h.event("before_agent_start", { systemPrompt: "BASE" });
  const second = h.event("before_agent_start", { systemPrompt: "BASE" });
  assert.equal(first.systemPrompt, second.systemPrompt);
  assert.match(first.systemPrompt, /must explicitly use \/execute/);
});
