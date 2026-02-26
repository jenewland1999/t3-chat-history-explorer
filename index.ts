import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/Pick";
import { streamArray } from "stream-json/streamers/StreamArray";

type ThreadRecord = {
  threadId?: string;
  id?: string;
  title?: string;
  created_at?: number;
  updated_at?: number;
  last_message_at?: number;
};

type MessageRecord = {
  threadId?: string;
  created_at?: number;
  role?: string;
  content?: string;
};

type ThreadMeta = {
  threadId: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  lastMessageAt?: number;
};

type ThreadStats = {
  firstMessageAt?: number;
  lastMessageAt?: number;
  totalMessages: number;
  inWindowMessages: number;
  firstInWindowAt?: number;
  lastInWindowAt?: number;
  firstUserMessage?: string;
};

type CliOptions = {
  file: string;
  from?: number;
  to?: number;
  limit: number;
  contains?: string;
};

function printUsage(): void {
  console.log(
    `\nT3 chat history explorer (Bun + streaming JSON)\n\nUsage:\n  bun run index.ts --file <export.json> [--from <ISO|ms>] [--to <ISO|ms>] [--limit <n>] [--contains <text>]\n\nExamples:\n  bun run index.ts --file threads-export.json --from 2026-02-25T09:00:00+10:00 --to 2026-02-25T11:00:00+10:00\n  bun run index.ts --file threads-export.json --from 1769990400000 --to 1770076800000 --limit 100\n\nNotes:\n  - Time values are unix epoch milliseconds internally.\n  - If no --from/--to is provided, the script prints most recent threads by activity.\n`,
  );
}

export function parseTime(input: string | undefined): number | undefined {
  if (!input) return undefined;
  if (/^\d+$/.test(input)) return Number(input);
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid time value: ${input}`);
  }
  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const get = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;
    return args[index + 1];
  };

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const file = get("--file") ?? "threads-export.json";
  const from = parseTime(get("--from"));
  const to = parseTime(get("--to"));
  const limitRaw = get("--limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  const contains = get("--contains")?.toLowerCase();

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  if (from !== undefined && to !== undefined && from > to) {
    throw new Error("--from must be less than or equal to --to");
  }

  return {
    file,
    from,
    to,
    limit,
    contains,
  };
}

function toIso(value: number | undefined): string {
  if (value === undefined) return "-";
  return new Date(value).toISOString();
}

async function loadThreadMap(
  filePath: string,
): Promise<Map<string, ThreadMeta>> {
  const threadMap = new Map<string, ThreadMeta>();
  const pipeline = chain([
    createReadStream(filePath),
    parser(),
    pick({ filter: "threads" }),
    streamArray(),
  ]);

  for await (const chunk of pipeline as AsyncIterable<{
    value: ThreadRecord;
  }>) {
    const value = chunk.value;
    const threadId = value.threadId ?? value.id;
    if (!threadId) continue;

    threadMap.set(threadId, {
      threadId,
      title: value.title?.trim() || "(untitled)",
      createdAt: value.created_at,
      updatedAt: value.updated_at,
      lastMessageAt: value.last_message_at,
    });
  }

  return threadMap;
}

export function messageInWindow(
  createdAt: number | undefined,
  from?: number,
  to?: number,
): boolean {
  if (createdAt === undefined) return false;
  if (from !== undefined && createdAt < from) return false;
  if (to !== undefined && createdAt > to) return false;
  return true;
}

async function scanMessages(
  filePath: string,
  options: CliOptions,
): Promise<Map<string, ThreadStats>> {
  const statsMap = new Map<string, ThreadStats>();

  const pipeline = chain([
    createReadStream(filePath),
    parser(),
    pick({ filter: "messages" }),
    streamArray(),
  ]);

  for await (const chunk of pipeline as AsyncIterable<{
    value: MessageRecord;
  }>) {
    const value = chunk.value;
    const threadId = value.threadId;
    if (!threadId) continue;

    const createdAt = value.created_at;
    const content = value.content ?? "";

    let stats = statsMap.get(threadId);
    if (!stats) {
      stats = {
        totalMessages: 0,
        inWindowMessages: 0,
      };
      statsMap.set(threadId, stats);
    }

    stats.totalMessages += 1;

    if (createdAt !== undefined) {
      if (
        stats.firstMessageAt === undefined ||
        createdAt < stats.firstMessageAt
      ) {
        stats.firstMessageAt = createdAt;
      }
      if (
        stats.lastMessageAt === undefined ||
        createdAt > stats.lastMessageAt
      ) {
        stats.lastMessageAt = createdAt;
      }
    }

    if (!stats.firstUserMessage && value.role === "user" && content.trim()) {
      stats.firstUserMessage = content.replace(/\s+/g, " ").slice(0, 120);
    }

    const inWindow = messageInWindow(createdAt, options.from, options.to);
    if (!inWindow) continue;

    if (options.contains && !content.toLowerCase().includes(options.contains)) {
      continue;
    }

    stats.inWindowMessages += 1;

    if (createdAt !== undefined) {
      if (
        stats.firstInWindowAt === undefined ||
        createdAt < stats.firstInWindowAt
      ) {
        stats.firstInWindowAt = createdAt;
      }
      if (
        stats.lastInWindowAt === undefined ||
        createdAt > stats.lastInWindowAt
      ) {
        stats.lastInWindowAt = createdAt;
      }
    }
  }

  return statsMap;
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const filePath = resolve(process.cwd(), options.file);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`Scanning export: ${options.file}`);
  if (options.from !== undefined || options.to !== undefined) {
    console.log(`Time window: ${toIso(options.from)} .. ${toIso(options.to)}`);
  } else {
    console.log("Time window: not provided (showing most recent threads)");
  }
  if (options.contains) {
    console.log(`Message text filter: contains \"${options.contains}\"`);
  }

  const threadMap = await loadThreadMap(filePath);
  const statsMap = await scanMessages(filePath, options);

  const rows = [...statsMap.entries()]
    .map(([threadId, stats]) => {
      const meta = threadMap.get(threadId);
      return {
        threadId,
        title: meta?.title ?? "(untitled)",
        totalMessages: stats.totalMessages,
        inWindowMessages: stats.inWindowMessages,
        firstMessageAt: stats.firstMessageAt,
        lastMessageAt: stats.lastMessageAt,
        firstInWindowAt: stats.firstInWindowAt,
        lastInWindowAt: stats.lastInWindowAt,
        firstUserMessage: stats.firstUserMessage ?? "",
      };
    })
    .filter((row) => {
      if (options.from === undefined && options.to === undefined) return true;
      return row.inWindowMessages > 0;
    })
    .sort((a, b) => {
      const aSort = a.firstInWindowAt ?? a.lastMessageAt ?? 0;
      const bSort = b.firstInWindowAt ?? b.lastMessageAt ?? 0;
      return bSort - aSort;
    })
    .slice(0, options.limit);

  if (rows.length === 0) {
    console.log("\nNo matching threads found for the current filter.");
    return;
  }

  console.log(`\nFound ${rows.length} matching thread(s):\n`);
  for (const row of rows) {
    console.log(`- title: ${row.title}`);
    console.log(`  threadId: ${row.threadId}`);
    console.log(`  messages in window: ${row.inWindowMessages}`);
    console.log(`  first in window: ${toIso(row.firstInWindowAt)}`);
    console.log(`  last in window:  ${toIso(row.lastInWindowAt)}`);
    console.log(
      `  thread span:     ${toIso(row.firstMessageAt)} .. ${toIso(row.lastMessageAt)}`,
    );
    if (row.firstUserMessage) {
      console.log(`  first user msg:  ${row.firstUserMessage}`);
    }
    console.log("");
  }

  if (options.from === undefined || options.to === undefined) {
    console.log(
      "Tip: pass --from and --to to narrow to your exact chat window.",
    );
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error("\nError:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
