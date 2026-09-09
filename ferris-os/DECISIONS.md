# FERRIS-OS — Architectural decision log

Running changelog of architectural choices and their reasoning. Newest entries at the bottom.
Each entry: status, decision, why, consequences, and what would make us revisit it.
Full Phase 0 analysis lives in `docs/PHASE-0-DECISIONS.md`; this file is the short form that stays current.

Statuses: `proposed` (awaiting sign-off), `accepted`, `superseded by D-XXXX`, `rejected`.

---

## D-0001 — Base distribution: Arch Linux + archiso, snapshot-pinned

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** Derive from Arch Linux. Every build pins `[core]`/`[extra]` to one Arch Linux Archive date and a lockfile of exact package versions and hashes. Our changes live in overlay repos listed above Arch's in `pacman.conf`.
- **Why:** Rust userland packages are current in Arch; package overriding is trivial via `provides`/`conflicts` + repo order; archiso is the simplest ISO tooling; layered signed repos are native to pacman.
- **Consequences:** We are a derivative, not a fork. Security updates arrive on snapshot bumps, not continuously. Release = snapshot date + lockfile + repo state.
- **Revisit if:** Arch's rolling churn makes snapshot bumps cost more than a Debian backport pile would; then Debian trixie + live-build is the fallback.

## D-0002 — Init: systemd for v1

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** Keep systemd as PID 1 and service manager. No Rust init in v1.
- **Why:** No Rust logind, udev, or unit-compatible service manager is shippable. Removing systemd from an Arch base means re-doing what Artix does (hundreds of overlay packages) before writing a service manager. XFCE, polkit, NetworkManager, PipeWire user services and rootless podman cgroup delegation all assume logind/systemd.
- **Consequences:** Rust enters the boot path via `ferris-initrd` (initramfs `/init`, Phase 3) and systemd satellites (`ntpd-rs` for time, `zram-generator`). `systemd-resolved` disabled; NM manages `resolv.conf`.
- **Revisit if:** a Rust project implements `org.freedesktop.login1` plus systemd unit parsing (watch `sysmaster`). Then a Phase 6+ research track.

## D-0003 — libc: glibc, dynamic linking

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** glibc system. musl static target used only for `ferris-initrd`, the rescue tool bundle, and anything that runs before `/usr` is mounted.
- **Why:** Proprietary userspace (NVIDIA libs, Steam, Chrome, vendor drivers) is glibc-only. Static musl binaries can't use NSS, which `sudo`, `login`, `ls -l` and greetd need. glibc's locale support matters for a desktop.
- **Consequences:** Alpine ruled out. Kernel modules are unaffected either way.
- **Revisit if:** never for v1.

## D-0004 — Packages: inherit ALPM, Rust frontend

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** Keep pacman, `.pkg.tar.zst`, `repo-add` databases, `makepkg`, hooks. Build `ferris-pkg` (Rust, `alpm` crate) as the user-facing CLI. Sign packages and DBs with sequoia `sq`; `ferris-pkg` re-verifies with `sequoia-openpgp`; downloads via rustls with SHA-256 checked against the signed DB.
- **Why:** A package manager plus re-packaging XFCE's dependency tree is years of work. Arch is itself moving ALPM tooling to Rust (`alpm-types`, `alpm-srcinfo`, …), so the format is the right bet.
- **Consequences:** Layered repos: `[ferris-core]`, `[ferris-desktop]`, `[ferris-nonfree]`, `[ferris-zfs]` above `[core]`/`[extra]`. One key per repo in `ferris-keyring`.
- **Revisit if:** Arch's ALPM Rust project ships a transaction engine; adopt it, don't write one.

## D-0005 — Display manager: greetd + ReGreet

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** greetd (Rust) with ReGreet (Rust, GTK4) under `cage`. LightDM packaged as fallback. Lock screen: `xfce4-screensaver`.
- **Why:** Both Rust; ReGreet supports session selection and theming. Live ISO autologin via greetd `initial_session`.
- **Consequences:** No user switching, no XDMCP, no accessibility greeter. `light-locker` unavailable (needs LightDM).
- **Revisit if:** user switching or a11y become requirements.

## D-0006 — Sessions: X11 guaranteed, Wayland experimental

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** XFCE 4.20 X11 session (xfwm4) is the default. A `labwc`-based XFCE Wayland session ships labelled *experimental*.
- **Why:** xfwm4 is X11-only; XFCE's Wayland support is partial upstream.
- **Revisit if:** XFCE ships a Wayland-capable compositor as an official component.

## D-0007 — Shells: nushell interactive via shim, dash as /bin/sh

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** User login shell = `ferris-login-shell` (Rust): `exec nu` on an interactive TTY, `exec /bin/sh -c` otherwise. `/bin/sh` = dash. bash stays installed (makepkg, mkinitcpio, Arch hooks require it). brush available via `ferris-alt sh brush` once our scripts pass under it in CI.
- **Why:** sshd, scp, rsync and GUI launchers run `$SHELL -c`; nushell as the raw login shell breaks remote POSIX commands.
- **Consequences:** `chsh` is pre-set to the shim for users created by the installer; power users can set `nu` directly and accept the caveat (documented in COMPATIBILITY.md).

## D-0008 — Terminal: alacritty default

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** alacritty is the default terminal, registered via `xdg-terminal-exec` and exo. xfce4-terminal and wezterm installed.
- **Why:** Steady releases and simple config; wezterm's stable releases are infrequent.

## D-0009 — Compatibility layout and `ferris-alt`

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** `/usr/bin/<tool>` → `/etc/ferris/alt/<tool>` → `/usr/lib/ferris/{rust,compat}/bin/<tool>`. Rust package owns `/usr/bin` name and `rust/bin`; `compat-<pkg>` owns `compat/bin`. A pacman hook creates the `/etc/ferris/alt` link only if absent so upgrades don't reset choices. `ferris-alt` flips links per tool or globally. `compat/bin` is never on `PATH`.
- **Why:** Implements the hard rule (Rust default, C reachable, no silent breakage) with the Debian-alternatives model, which is proven across upgrades.
- **Consequences:** Interactive-only aliases (`ls→eza`, `cat→bat`, `du→dust`) are allowed in shell rc files since scripts never load them.

## D-0010 — Explicit exceptions: tools that stay C under their POSIX name

- **Date:** 2026-09-09  **Status:** proposed — **needs explicit sign-off**
- **Decision:** `grep`, `sed`, `awk`, `less`, `ps`, `top`, `patch`, `diff3`, `sdiff`, `ssh`/`sshd`, `login`/`passwd`/`useradd` keep their C implementations as the POSIX-named default. Rust alternatives (`rg`, `sd`, `bat`, `procs`, `btm`) ship under their own names and are promoted in the interactive shell.
- **Why:** These Rust tools are different tools, not reimplementations. Putting `rg` behind `grep` changes regex semantics silently; `fd` shares nothing with `find`'s language; no Rust pager, sshd, or shadow-utils exists. That is the silent breakage the hard rule forbids.
- **Revisit if:** uutils `sed`/`procps`/`util-linux` reach GNU-test-suite parity for a given tool; adopt per tool via `ferris-alt`.

## D-0011 — Reproducibility gates

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** Phase 1 gate: bit-identical `airootfs.sfs` from two builds of the same commit. Phase 5 gate: bit-identical ISO across two CI runs, verified with diffoscope.
- **Why:** Squashfs determinism is tractable now; the xorriso/El Torito layer and archiso's partial `SOURCE_DATE_EPOCH` support need `ferris-build` to own that step.

## D-0012 — Containers, firewall, networking defaults

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** Rootless podman with `youki` as default OCI runtime (`crun` fallback), `pasta` networking, systemd user-slice cgroup delegation preconfigured. nftables only; `ferris-fw` (Rust) manages profiles; no firewalld. NetworkManager with iwd backend manages bridges/VLANs/veth; no systemd-networkd.
- **Why:** One network manager, one firewall layer, Rust where a mature option exists.

## D-0013 — ZFS as opt-in prebuilt-module repo

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** `[ferris-zfs]` ships `zfs-linux-lts` built against the pinned kernel (archzfs model). Installer greys out ZFS when no matching module exists. Not on the base ISO by default.
- **Why:** Out-of-tree, CDDL, kernel-version-coupled. Best-effort in v1.

## D-0014 — Repository layout

- **Date:** 2026-09-09  **Status:** proposed
- **Decision:** All FERRIS-OS content under `ferris-os/` in this repository; Cargo workspace at `ferris-os/crates/`; archiso profiles at `ferris-os/profiles/`; packages (PKGBUILDs) at `ferris-os/packages/`; docs at `ferris-os/docs/`.
- **Why:** This repository also holds unrelated projects. A dedicated repository would be cleaner; owner's call.
