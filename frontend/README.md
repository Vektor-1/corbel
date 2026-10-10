# Corbel: Educational Architecture Design Tool for Ghana

A browser-based 2D/3D architectural design tool built for Ghanaian students, with **real-time design review heuristics** — one directly cited to Ghana Building Code (GS 1207:2018 Part 7, wall thickness), the rest Corbel's own spatial/structural checks pending a full jurisdiction-specific rule set.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000/editor](http://localhost:3000/editor)

## 📚 Documentation

**All project documentation is in `/docs`** — structured by category:

- **[Overview](../docs/overview/)** — What is Corbel, value proposition, attribution
- **[Architecture](../docs/architecture/)** — Technical design, project setup
- **[Guides](../docs/guides/)** — How-to guides, best practices
- **[FAQ](../docs/faq/)** — Common questions (coming soon)
- **[Research](../docs/research/)** — FYP study design, methodology (coming soon)

**→ [Full Documentation Index](../docs/README.md)**

## What is Corbel?

Corbel teaches architectural students to design buildings while getting real-time, rule-linked feedback:

- 🎨 **2D Floor Plan Drawing** (Konva.js)
- 🏗️ **Real-Time 3D Visualization** (React Three Fiber)
- ✓ **Code-Informed Review Heuristics** (one rule directly cited to GS 1207:2018; a full jurisdiction-specific checker is future work, not current scope)
- 📍 **Local Materials** (Sandcrete, laterite with real-world data)

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **2D Canvas**: Konva.js + React-Konva
- **3D Viewer**: React Three Fiber + Three.js
- **State**: Zustand
- **Styling**: Tailwind CSS

## Licensing

**MIT Licensed**. See [Attribution](../docs/overview/ATTRIBUTION.md) for third-party credits.

## Development

```bash
# Development server
npm run dev

# Production build
npm run build
npm start

# Deploy to Vercel
vercel
```

---

**[📖 Read Full Documentation](../docs/README.md)**
