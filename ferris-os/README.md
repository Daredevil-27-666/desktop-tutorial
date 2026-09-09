# FERRIS-OS

A Linux distribution where the userland above the kernel is Rust wherever that is practical,
running XFCE. Linux kernel unchanged. x86_64 only for v1.

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Decision document | **Draft, awaiting sign-off** — `docs/PHASE-0-DECISIONS.md` §12 |
| 1 | Minimal bootable ISO, Rust coreutils, shell only | not started |
| 2 | XFCE session, networking, audio, graphics | not started |
| 3 | TUI installer, LUKS, boots from disk | not started |
| 4 | Theming, branding, first-boot wizard | not started |
| 5 | Package tooling, signed repos, reproducible CI builds | not started |

Documents:

- `docs/PHASE-0-DECISIONS.md` — base distro, init, libc, package format, userland matrix, desktop and system architecture, custom components, unsolved problems.
- `DECISIONS.md` — running changelog of architectural decisions.
- `COMPATIBILITY.md` — every deviation from GNU/POSIX behaviour and how to switch back.

Planned layout once Phase 1 starts:

```
ferris-os/
  crates/      Cargo workspace: ferris-build, ferris-alt, ferris-login-shell, ferris-install, ...
  packages/    PKGBUILDs for overlay repos ([ferris-core], [ferris-desktop], ...)
  profiles/    archiso profiles (minimal, desktop)
  docs/
```
