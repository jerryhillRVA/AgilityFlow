---
name: Project Conventions
description: Coding standards and conventions for Agility Flow
---

# Project Conventions

- TypeScript strict mode
- Next.js App Router with server components by default
- Tailwind CSS for styling
- All API responses use NextResponse.json()
- Error responses include { error: string, details?: unknown }
- File naming: kebab-case for files, PascalCase for components
- All async operations handle errors with try/catch
- Use native fetch (no axios)
- Prefer composition over inheritance
- Keep components focused and small
