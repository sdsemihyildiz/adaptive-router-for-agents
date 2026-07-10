const mode = process.env.ADAPTIVE_ROUTER_FAKE_MODE || "success";
if (mode === "success") {
  process.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "fake worker ok" } })}\n`);
} else if (mode === "failure") {
  process.stdout.write(`${JSON.stringify({ type: "turn.failed", error: { message: "fake worker failure" } })}\n`);
  process.exitCode = 1;
} else if (mode === "timeout") {
  setInterval(() => {}, 1000);
}
