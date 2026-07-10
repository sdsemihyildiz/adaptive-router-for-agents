import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

test("optional coordinator configuration backs up and edits only top-level settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adaptive-router-config-"));
  const config = join(directory, "config.toml");
  await writeFile(
    config,
    'model = "gpt-5.6-terra"\nmodel_reasoning_effort = "high"\n\n[profiles.example]\nmodel = "keep-profile-model"\n',
    "utf8",
  );
  try {
    const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "configure-coordinator.mjs"), config], {
      encoding: "utf8",
      shell: false,
    });
    assert.equal(result.status, 0, result.stderr);
    const updated = await readFile(config, "utf8");
    assert.match(updated, /^model = "gpt-5\.6-luna"$/m);
    assert.match(updated, /^model_reasoning_effort = "low"$/m);
    assert.match(updated, /^model = "keep-profile-model"$/m);
    const files = await readdir(directory);
    assert.equal(files.filter((name) => name.endsWith(".bak")).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
