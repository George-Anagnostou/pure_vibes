import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCommandLineFetch,
  notATerminalScript,
  script,
} from "@/lib/install-script";

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

describe("personal installer (from /i/<code>)", () => {
  it("embeds a gb_ key so the script needs no input", () => {
    const out = script("https://example.com", "gb_abcdefghijklmnopqrstuv");
    expect(out).toContain("GLASSBOX_AGENT_KEY:-gb_abcdefghijklmnopqrstuv");
  });
  it("refuses anything that isn't a plain gb_ key", () => {
    expect(() => script("https://example.com", "gb_x'; rm -rf / #")).toThrow();
    expect(() => script("https://example.com", "sk_live_abc")).toThrow();
  });
});

describe("/i/<code> redemption gate", () => {
  it("only treats command-line fetchers as redeemers", () => {
    for (const ua of ["curl/8.7.1", "Wget/1.21.4", "fetch/1.0"])
      expect(isCommandLineFetch(ua)).toBe(true);
    for (const ua of [
      null,
      "",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15",
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
    ])
      expect(isCommandLineFetch(ua)).toBe(false);
  });

  it("explains how to run it without consuming the code, as valid shell", () => {
    const s = notATerminalScript("https://example.com/i/ABCD1234");
    expect(s).toContain("curl -fsSL https://example.com/i/ABCD1234 | sh");
    expect(() => execFileSync("sh", ["-n"], { input: s })).not.toThrow();
  });
});
