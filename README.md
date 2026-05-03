![Arkon Banner](docs/assets/banner.png)

# Arkon

**Enterprise knowledge management for Claude — self-hosted, on-premise.**

Arkon gives organizations centralized control over how employees use Claude. Admins manage knowledge, access policies, and project contexts from a single portal. Employees connect once and get the right context automatically through the Model Context Protocol (MCP).

---

## The problem

Most organizations adopt Claude team-by-team with no shared knowledge, inconsistent context, and no visibility into how AI is being used. Every employee manually pastes documents, repeats the same background, and gets different answers depending on what they remembered to include.

Arkon treats Claude as a managed organizational resource — not a public chatbot.

---

## How it works

When a document is uploaded, Arkon doesn't just index it — it **compiles** it. An LLM reads the document and writes structured knowledge into a persistent wiki: entity pages, concept pages, topic summaries, all interlinked with `[[wikilinks]]`. Each new document updates and enriches the same wiki rather than adding isolated chunks.

When an employee's Claude queries Arkon, it reads from the compiled wiki — synthesized knowledge, not raw fragments. The wiki accumulates and improves with every document added.

```
Upload document
      │
      ▼
[Extract text + images]  ──→  vision captions inlined
      │
      ▼
[LLM Wiki Compiler]
  · Reads existing wiki index
  · Creates / updates wiki pages
  · Links related concepts via [[wikilinks]]
      │
      ▼
[Wiki stored in PostgreSQL]
  slug, title, content_md, summary
  knowledge_type_slugs[], source_ids[]
  embedding (pgvector)
      │
      ▼
Claude queries via MCP  ──→  reads compiled wiki, not raw chunks
```

---

## Features

### Knowledge Wiki
Upload documents (PDF, DOCX, spreadsheets, URLs) and an LLM compiles them into a structured wiki. Knowledge compounds over time — later documents enrich existing wiki pages rather than creating duplicate entries.

- Organize by **knowledge type** (SOP, Product, HR Policy, etc.) — admin-defined
- Assign documents to **departments** for scoped access
- Background compilation pipeline with real-time progress tracking
- Employee contribution tracking — every document attributed to its uploader
- Re-compile any document on demand

### Access Control (RBAC)
Fine-grained access at department and individual level. When an employee connects via MCP, Arkon resolves their identity, department, and knowledge scope — then filters which wiki pages they can read.

```
Sales dept     → knowledge: product catalog, customer profiles
Support dept   → knowledge: FAQs, troubleshooting SOPs
HR dept        → knowledge: internal policies, org structure
Individual     → personal scope override if needed
```

Wiki pages synthesized from multiple sources inherit the union of their contributing knowledge types — a page is visible if the employee has access to at least one of its types.

### Projects
Cross-functional knowledge contexts for initiatives that don't fit neatly into a department.

Create a **Project** (client engagement, product launch, board prep) → add members from any department → attach relevant documents. Project members get access to those documents through MCP automatically. When the project ends, archive it.

### MCP Server
Employees connect Claude Desktop to Arkon's MCP server using a personal token. Claude has two layers of access:

**Wiki layer** — compiled, synthesized knowledge:

| Tool | Description |
|---|---|
| `search_wiki` | Semantic search across the knowledge wiki (RBAC filtered) |
| `read_wiki_index` | Browse the full wiki catalog |
| `read_wiki_page` | Read a specific wiki page with backlinks |
| `list_wiki_pages` | Filter pages by type or knowledge category |

**Source layer** — raw document drill-down for precise citations:

| Tool | Description |
|---|---|
| `list_sources` | Browse uploaded source documents |
| `get_source` | Document metadata and status |
| `get_source_outline` | Table of contents tree (headings-based) |
| `get_source_pages` | Raw text for specific page range (e.g. `"5-7"`) |

**Directory:**

| Tool | Description |
|---|---|
| `find_contacts` | Search the internal people directory |
| `list_knowledge_types` | Browse knowledge categories |
| `get_knowledge_type_docs` | All documents of a specific category |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  On-Premise Server                │
│                                                   │
│  ┌───────────────┐    ┌────────────────────────┐  │
│  │  Admin Portal │    │    Arkon API + MCP     │  │
│  │               │    │                        │  │
│  │  · Knowledge  │───▶│  · LLM Wiki Compiler   │  │
│  │  · RBAC       │    │  · Scope Resolution    │  │
│  │  · Projects   │    │  · MCP Tool Server     │  │
│  │  · Contacts   │    │  · Auth & Tokens       │  │
│  └───────────────┘    └───────────┬────────────┘  │
│                                   │               │
└───────────────────────────────────┼───────────────┘
                                    │ MCP (HTTPS)
                       ┌────────────┼────────────┐
                       │            │            │
                Claude Desktop   Claude.ai   Any MCP
                (employees)      (web)       client
```

**Stack:**
- **Backend** — FastAPI, PostgreSQL + pgvector, Redis (arq), MinIO
- **Frontend** — Next.js, Tailwind CSS
- **AI** — provider-agnostic: Google, OpenAI, or Anthropic for embedding, LLM, and vision
- **Outbound** — configured AI provider only. No other external calls.

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- An API key for your AI provider (Google, OpenAI, or Anthropic)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/arkon.git
cd arkon
cp .env.example .env
```

Edit `.env` — at minimum set:

```env
SECRET_KEY=your-random-secret-here
DEFAULT_ADMIN_EMAIL=admin@yourcompany.com
DEFAULT_ADMIN_PASSWORD=change-this-password
```

### 2. Start services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, MinIO, the API server, the background worker, and the frontend portal.

### 3. Configure AI providers

Open the admin portal at `http://localhost:3000` and log in with the credentials from your `.env`.

Go to **Settings** and configure your embedding model, LLM, and (optionally) vision model. The LLM is used for wiki compilation — choose a model with a large context window (e.g. `gemini-2.5-pro`, `gpt-4o`, `claude-sonnet-4-5`).

### 4. Upload knowledge

Go to **Knowledge Base** and upload your first document. Arkon will extract text, analyze images, and compile the content into your wiki. Progress is shown in real time.

### 5. Connect an employee to Claude

1. Create a department and employee account in the portal
2. Generate an MCP token for the employee (`Employees → Token`)
3. Add the MCP server to Claude Desktop's config:

```json
{
  "mcpServers": {
    "arkon": {
      "url": "https://your-arkon-server/mcp",
      "headers": {
        "Authorization": "Bearer <employee-mcp-token>"
      }
    }
  }
}
```

The employee opens Claude Desktop — the compiled wiki for their scope is available immediately.

---

## Project Structure

```
arkon/
├── app/
│   ├── routers/          # API endpoints (sources, wiki, rbac, projects, ...)
│   ├── services/         # Auth, MCP auth, wiki CRUD, source outline, storage
│   ├── database/         # SQLAlchemy models, repository
│   ├── ai/               # Provider-agnostic LLM, embedding, vision + wiki compiler
│   ├── mcp/              # MCP server, tools, resources
│   └── worker.py         # Background ingestion + wiki compilation jobs (arq)
├── frontend/
│   └── src/
│       ├── app/(portal)/ # Admin portal pages
│       └── components/   # UI components
└── alembic/              # Database migrations
```

---

## Roadmap

- [x] MCP Server with scoped knowledge access
- [x] Document ingestion pipeline (PDF, DOCX, URLs, images with vision captions)
- [x] LLM Wiki Compiler — documents compiled into persistent, interlinked wiki pages
- [x] Knowledge types and department-level RBAC
- [x] Project contexts for cross-functional access
- [x] Admin portal UI
- [x] Contacts directory
- [x] Employee contribution tracking (document attribution)
- [x] Raw source drill-down via MCP (outline + page-level citations)
- [ ] Wiki browser in admin portal (read, search, graph view)
- [ ] Employee knowledge contribution (suggest edits, flag outdated content)
- [ ] Audit logs and usage analytics
- [ ] SSO (Active Directory, Google Workspace, SAML)
- [ ] Arkon CLI for one-command employee setup

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

---

## License

Arkon is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).

You may use, study, and modify Arkon freely for **noncommercial purposes** — internal tooling, research, personal projects, and non-profit use are all fine.

**Need something beyond that?** We help organizations integrate Claude, custom AI agents, and MCP servers into their existing infrastructure and workflows — from connecting to internal databases and legacy systems to building purpose-built agents for specific business processes.

[Get in touch](https://bitsness.vn) if you're looking to build something custom.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nduckmink/arkon&type=Date)](https://star-history.com/#nduckmink/arkon&Date)
