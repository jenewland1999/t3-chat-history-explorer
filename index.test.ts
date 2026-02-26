import { describe, expect, test } from "bun:test";
import { messageInWindow, parseArgs, parseTime } from "./index";

describe("parseTime", () => {
  test("returns undefined for empty input", () => {
    expect(parseTime(undefined)).toBeUndefined();
  });

  test("parses unix milliseconds", () => {
    expect(parseTime("1700000000000")).toBe(1700000000000);
  });

  test("parses ISO strings", () => {
    expect(parseTime("2026-02-25T09:00:00Z")).toBe(
      Date.parse("2026-02-25T09:00:00Z"),
    );
  });

  test("throws for invalid time", () => {
    expect(() => parseTime("not-a-time")).toThrow("Invalid time value");
  });
});

describe("parseArgs", () => {
  test("applies defaults", () => {
    const options = parseArgs([]);
    expect(options.file).toBe("threads-export-2026-02-26T12_07_18.856Z.json");
    expect(options.limit).toBe(50);
    expect(options.from).toBeUndefined();
    expect(options.to).toBeUndefined();
    expect(options.contains).toBeUndefined();
  });

  test("parses all supported flags", () => {
    const options = parseArgs([
      "--file",
      "threads.json",
      "--from",
      "1700000000000",
      "--to",
      "1700000001000",
      "--limit",
      "25",
      "--contains",
      "Hello",
    ]);

    expect(options).toEqual({
      file: "threads.json",
      from: 1700000000000,
      to: 1700000001000,
      limit: 25,
      contains: "hello",
    });
  });

  test("throws when limit is invalid", () => {
    expect(() => parseArgs(["--limit", "0"])).toThrow("Invalid --limit value");
  });

  test("throws when from is after to", () => {
    expect(() => parseArgs(["--from", "2", "--to", "1"])).toThrow(
      "--from must be less than or equal to --to",
    );
  });
});

describe("messageInWindow", () => {
  test("returns false for undefined message timestamp", () => {
    expect(messageInWindow(undefined, 1, 10)).toBe(false);
  });

  test("returns true when within range", () => {
    expect(messageInWindow(5, 1, 10)).toBe(true);
  });

  test("returns false when below range", () => {
    expect(messageInWindow(0, 1, 10)).toBe(false);
  });

  test("returns false when above range", () => {
    expect(messageInWindow(11, 1, 10)).toBe(false);
  });
});
