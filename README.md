# Tiger 🐯

A local web dashboard for running and managing AI coding agents. Tiger gives you a browser-based UI to launch, monitor, and interact with [GitHub Copilot coding agents](https://docs.github.com/en/copilot) and general-purpose terminal sessions — all from one place.

> **Note:** Tiger runs entirely on your own machine. No data is sent anywhere except to the AI provider you configure.

---

## Features

- **Project management** — organise your work into projects, each with their own agent sessions
- **Copilot agent sessions** — launch and chat with GitHub Copilot coding agents; watch them work in real time via a streaming message view
- **Terminal sessions** — full PTY terminal windows inside the browser, useful for running commands alongside your agents
- **Live links sidebar** — URLs produced by the agent (PRs, issues, commits, files) are automatically extracted and shown as a clickable sidebar so you never lose track of what was created
- **Git panel** — view diffs and staged changes for a project at a glance
- **PR panel** — monitor open pull requests
- **Planner panel** — keep a running task list alongside an agent session
- **Memory panel** — persistent notes that carry context across sessions
- **MCP server support** — connect Model Context Protocol servers to extend agent capabilities
- **Retro CRT aesthetic** — amber phosphor for agent windows, green phosphor for terminals
- **Settings UI** — configure your GitHub token, AI key, AI base URL, default agent command and flags — all stored locally in `~/.tiger/settings.json`

---

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [GitHub CLI (`gh`)](https://cli.github.com/) — authenticated with `gh auth login`
- A GitHub Copilot subscription (for Copilot agent sessions)
- An AI API key if using a non-default AI provider (optional)

---

## Installation

```bash
# Clone the repo
git clone https://github.com/GrantMeStrength/tiger.git
cd tiger

# Install dependencies
npm install

# Start Tiger
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

On first run, click the **⚙ Settings** button and enter your GitHub token and (optionally) your AI API key. Settings are saved to `~/.tiger/settings.json` and never committed to the repo.

### Development mode

```bash
npm run dev
```

This starts the Next.js dev server with hot reload.

---

## Windows

Tiger should work on Windows 10 (build 1903+) and Windows 11, but requires a couple of extra steps:

1. **Install Windows Build Tools** — `node-pty` (used for terminal sessions) requires native compilation:
   ```powershell
   npm install --global windows-build-tools
   ```
   Or install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.

2. **Install the GitHub CLI** from [cli.github.com](https://cli.github.com/) and run `gh auth login`.

3. Run `npm install` and `npm start` as normal.

> Terminal sessions use Windows ConPTY (available in Windows 10 1903+). If you're on an older build, terminal windows may not work, but Copilot agent sessions will still function.

---

## Configuration

| Setting | Description | Default |
|---|---|---|
| GitHub Token | Classic PAT with `repo` + `read:org` scopes | — |
| AI Key | API key for your AI provider | — |
| AI Base URL | Base URL for the AI API | `https://models.inference.ai.azure.com` |
| Default Command | Command used to launch agent sessions | `gh copilot code` |
| Default Flags | Flags appended to the launch command | `--yolo --resume` |
| MCP Servers | List of Model Context Protocol servers | — |

---

## License

MIT
