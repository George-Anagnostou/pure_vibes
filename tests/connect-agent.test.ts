import { describe, expect, it } from "vitest";
import { clientSetups, installCommand } from "@/components/connect-agent";

const origin = "https://glass-box-app.vercel.app";
const key = "gb_test_placeholder";

describe("connection instructions", () => {
  it("provides renderable instructions and removal guidance for every tab", () => {
    const setups = clientSetups(origin, key);
    expect(setups.map((setup) => setup.id)).toEqual([
      "claude-code",
      "codex",
      "claude-desktop",
      "other",
    ]);
    for (const setup of setups) {
      expect(setup.hint).toBeTruthy();
      expect(setup.code).toContain(key);
      expect(setup.after).toBeTruthy();
      expect("command" in setup.remove || "text" in setup.remove).toBe(true);
    }
  });

  it("passes Desktop's bearer header through env without splitting its spaces", () => {
    const desktop = clientSetups(origin, key).find(
      (setup) => setup.id === "claude-desktop",
    )!;
    const server = JSON.parse(desktop.code).mcpServers.glassbox;
    expect(server.args).toContain("Authorization:${AUTH_HEADER}");
    expect(server.env.AUTH_HEADER).toBe(`Bearer ${key}`);
  });

  it("provides Cursor's HTTP configuration and a matching URL-only fallback", () => {
    const other = clientSetups(origin, key).find(
      (setup) => setup.id === "other",
    )!;
    expect(JSON.parse(other.code).mcpServers.glassbox).toEqual({
      url: `${origin}/api/mcp/mcp`,
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(other.extra?.code).toBe(`${origin}/api/mcp/mcp?key=${key}`);
    expect(installCommand(origin, key)).toContain(`sh -s -- ${key}`);
  });
});
