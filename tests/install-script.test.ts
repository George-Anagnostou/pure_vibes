import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { script } from "@/lib/install-script";

describe("/install script", () => {
  it("embeds the origin and fetches the kit installer from it", () => {
    const s = script("https://glassbox.example");
    expect(s.startsWith("#!/bin/sh")).toBe(true);
    expect(s).toContain("URL='https://glassbox.example'");
    expect(s).toContain(
      'curl -fsSL "$URL/api/agent-kit/install.mjs" -o "$TMP/install.mjs"',
    );
    expect(s).toContain('--key "$KEY" --url "$URL"');
  });

  it.each([
    "https://evil.example'; rm -rf ~; '",
    "https://a.example/path",
    "javascript:alert(1)",
    "",
  ])("refuses unsafe origin %j", (origin) => {
    expect(() => script(origin)).toThrow();
  });

  it("is valid sh and rejects a non-gb_ key before downloading anything", () => {
    const dir = mkdtempSync(join(tmpdir(), "gb-install-"));
    try {
      const file = join(dir, "install.sh");
      writeFileSync(file, script("https://glassbox.example"));
      execFileSync("sh", ["-n", file]);
      let stderr = "";
      try {
        execFileSync("sh", [file, "not-a-key"], { cwd: dir, stdio: "pipe" });
      } catch (error) {
        stderr = String((error as { stderr?: Buffer }).stderr ?? "");
      }
      expect(stderr).toContain("start with gb_");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
