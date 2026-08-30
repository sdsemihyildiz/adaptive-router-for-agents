const mode = process.env.ADAPTIVE_ROUTER_FAKE_MODE || "success";
if (mode === "success") {
  process.stdout.write(`${JSON.stringify({ result: "fake worker ok" })}\n`);
} else if (mode === "failure") {
  process.stderr.write("fake worker failure\n");
  process.exitCode = 1;
} else if (mode === "json-error-result") {
  // Mirrors real `claude -p --output-format json` behavior: a JSON object on
  // stdout with is_error:true and a human-readable message in "result", even
  // on a nonzero exit and with nothing written to stderr.
  process.stdout.write(`${JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" })}\n`);
  process.exitCode = 1;
} else if (mode === "unsupported-effort") {
  if (process.argv.includes("--effort")) {
    process.stderr.write("error: unknown option '--effort'\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify({ result: "fake worker ok without effort" })}\n`);
  }
} else if (mode === "timeout") {
  setInterval(() => {}, 1000);
}
