# T3 Chat History Explorer

A small Bun CLI tool for searching [T3 Chat](https://t3.chat) export files by time range (with optional text filtering).

## Why I created this

I needed to find a specific thread in T3 Chat and knew roughly when I had sent it, but the in-product search wasn't enough to locate it quickly.

So I generated this CLI with GitHub Copilot to scan exported chat history by date/time window and surface likely threads. Ironically, the thread I was looking for turned out to be pinned all along, but the tool still solved the original problem and remains useful for future lookups.

## Built with

- [Bun](https://bun.com)
- TypeScript
- Streaming JSON parsing via `stream-json` (so large exports are handled efficiently)

## Clone and run

### 1) Clone

```bash
git clone https://github.com/<your-username>/t3-chat-history-explorer.git
cd t3-chat-history-explorer
```

### 2) Install dependencies

```bash
bun install
```

### 3) Run the CLI

```bash
bun run start --file threads-export-2026-02-26T12_07_18.856Z.json \
 --from 2026-02-25T09:00:00+10:00 \
 --to 2026-02-25T11:00:00+10:00 \
 --limit 100
```

You can also run directly:

```bash
bun run index.ts --help
```

## Usage

```bash
bun run start --file <export.json> [--from <ISO|ms>] [--to <ISO|ms>] [--limit <n>] [--contains <text>]
```

Example with text filtering:

```bash
bun run start --file threads-export-2026-02-26T12_07_18.856Z.json \
 --from 2026-02-25T09:00:00+10:00 \
 --to 2026-02-25T11:00:00+10:00 \
 --contains "keyword"
```

## Output includes

- Thread title
- Thread ID
- Message count in window
- First/last timestamp inside the window
- Overall thread message span

## Tests

```bash
bun test
```

## License

This project is licensed under the GNU GPL v3. See [LICENSE](LICENSE).

## Contributing

Contributions are welcome even though this started as a personal utility. See [CONTRIBUTING.md](CONTRIBUTING.md).
