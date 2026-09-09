# FERRIS-OS — Phase 0 Decision Document

| | |
|---|---|
| Status | **DRAFT — awaiting sign-off** (see §12) |
| Date | 2026-09-09 |
| Scope | The four base decisions, the Rust userland matrix, desktop/system-architecture choices, and the custom-component plan. No code is built until this is signed off. |
| Target | x86_64 only for v1. Nothing below blocks ARM64 later. |

---

## 0. Summary of recommendations

| # | Decision | Recommendation | Runner-up | Confidence |
|---|---|---|---|---|
| 1 | Base strategy | **Arch Linux + archiso**, every build pinned to a dated Arch Linux Archive snapshot, our own signed overlay repos on top | Debian trixie + live-build | High |
| 2 | Init | **systemd for v1.** Rust PID 1 deferred, with a defined path. Rust `/init` inside the initramfs in Phase 3. | — | High |
| 3 | libc | **glibc**, dynamic linking by default. musl static only for initramfs and rescue tools. | musl | High |
| 4 | Package format / manager | **Inherit pacman + `.pkg.tar.zst` + repo DB format.** Rust CLI (`ferris-pkg`) over libalpm; sequoia (Rust OpenPGP) for signing. Do not write a package manager. | Own Rust PM (rejected for v1) | High |
| 5 | Display manager | **greetd + ReGreet** (both Rust) | LightDM | Medium |
| 6 | Session | X11 XFCE session guaranteed; Wayland (labwc + XFCE 4.20 Wayland bits) shipped as *experimental* | — | High |
| 7 | Terminal | **alacritty** default; xfce4-terminal and wezterm installed | wezterm | Medium |
| 8 | `/bin/sh` | **dash**; brush available as opt-in via `ferris-alt` | brush | High |
| 9 | Interactive shell | **nushell**, delivered through a tiny Rust login-shell shim so `ssh host 'cmd'` keeps POSIX semantics | bash | Medium |
| 10 | Compat policy | Rust tool owns the POSIX name in `/usr/bin`; C original always installed at `/usr/lib/ferris/compat/bin`; `ferris-alt` flips per tool. **Four explicit exceptions** (grep, sed/awk, less, ps/top) where the Rust tool is *not* a drop-in — see §5. | — | Needs your call |

Everything else in this document is the reasoning.

---

## 1. Base strategy

### 1.1 Criteria and scoring

Scores 1–5, higher is better *for this project* (solo developer, Rust-first userland, reproducible ISO, XFCE desktop).

| Criterion | Arch + archiso | Debian + live-build | Alpine | LFS-from-scratch |
|---|---|---|---|---|
| Build reproducibility | 3 (rolling, but the Arch Linux Archive gives exact date snapshots; ~90% of packages reproducible, `archlinux-repro` verifies) | 5 (best in class, `SOURCE_DATE_EPOCH` everywhere, snapshot.debian.org) | 4 | 2 (it's whatever we make it, and we'd make all of it) |
| Rust tool availability & freshness | 5 (uutils, sudo-rs, nushell, eza, fd, rg, bat, greetd, alacritty, brush… in `[extra]`, rolling versions) | 2 (present but frozen at trixie's versions; Rust tools move fast; Debian's one-crate-one-package policy makes building our own tools painful) | 4 | 1 |
| Ease of swapping coreutils/sudo/etc. | 5 (`provides=`/`conflicts=`, repo ordering in `pacman.conf` decides the winner) | 2 (coreutils is `Essential: yes`; Ubuntu 25.10 proved it's possible but it required dpkg-level surgery and a switching tool, `oxidizr`) | 4 | 5 |
| ISO tooling pain | 5 (`mkarchiso` is one profile dir + one command; it builds the official ISO) | 2 (live-build is powerful and arcane; configuration is spread over dozens of hook dirs) | 4 (`mkimage.sh` is small and scriptable) | 1 |
| Proprietary drivers / firmware / binaries | 5 | 5 | 1 (musl; no NVIDIA proprietary, `gcompat` for the rest) | 4 |
| XFCE + NM + polkit + PipeWire integration | 5 | 5 | 3 (works, second-class) | 2 |
| Solo-dev maintenance burden | 4 (rolling churn, mitigated by snapshot pinning) | 3 (stable, but we'd carry many backports of Rust tools) | 3 | 1 |
| Layered signed repos | 5 (native: multiple `[repo]` sections, per-repo `SigLevel`, ordering = priority) | 4 (apt pinning; more ceremony) | 4 | n/a |
| **Total** | **37** | **28** | **27** | **17** |

### 1.2 Reasoning

**Arch wins because the whole point of this distro is the userland, and Arch is the only base where the userland is already current.** uutils, sudo-rs, brush, nushell, greetd, eza, fd, ripgrep, bat, alacritty, wezterm, bottom, procs, dust, duf, sd, sequoia, ntpd-rs and zram-generator are all in the official repos at recent versions. On Debian stable we'd spend Phase 1 backporting instead of building.

The reproducibility gap is real but solvable, and the solution is standard: **every FERRIS build is pinned to one Arch Linux Archive date** (`https://archive.archlinux.org/repos/YYYY/MM/DD/`). The build orchestrator resolves the full package set once, writes a lockfile with `pkgname-pkgver-pkgrel` plus SHA-256 for every package, and every subsequent build installs only from that lockfile. Arch stops being "rolling" the moment we do this. Our own packages are built in clean chroots (`devtools` / `pkgctl build`) with `SOURCE_DATE_EPOCH`, `cargo --locked` and vendored crate sources. See §7.8 for what remains hard about bit-identical ISOs.

**Swapping core packages** is where Arch is easiest by a wide margin. A package in our `[ferris-core]` repo that declares `provides=('coreutils') conflicts=('coreutils')`, with `[ferris-core]` listed above `[core]` in `pacman.conf`, wins every dependency resolution. No essential-package handling, no diversions.

**Prior art we lean on:** archiso (ships the official ISO), Artix (proves how much work a non-systemd Arch is — see §2), archzfs (prebuilt ZFS modules for `linux-lts`), and Arch's own **ALPM-in-Rust project** (§4).

### 1.3 Why not the others

- **Debian + live-build.** Best reproducibility story, and Debian's apt already verifies signatures with sequoia's `sqv`. But Debian's Rust freeze and packaging policy would make us a backport factory. Choose this only if you'd rather have a stable base than a fresh userland; that's a legitimate choice, and it's my runner-up.
- **Alpine.** musl is the deal-breaker (§3). Otherwise a clean, small, well-tooled base.
- **LFS.** Maximum control, maximum labor. For a solo dev the realistic outcome is a distro that never reaches Phase 2. Not recommended.
- **NixOS / Guix** (not on your list, but they own the reproducibility niche). Rejected because the "package manager and format" would be Nix, not something we can reasonably wrap or later replace in Rust; overriding `stdenv` coreutils rebuilds the world; and the FHS-less layout fights proprietary software and out-of-tree modules. Worth stealing ideas from (lockfile-first thinking), not worth adopting.

### 1.4 Consequences

- Kernel = Arch's `linux-lts` package (whichever LTS series it tracks at the snapshot date, 6.12 or 6.18), plus `linux-lts-headers`. Custom kernel path documented in §7.1.
- We are a *derivative*, not a fork: we do not rebuild `[core]`/`[extra]`, we overlay them. Our repos hold only what we change or add.
- Release = a snapshot date + a lockfile + our repo state, all in git.
- A rolling base means we re-snapshot on our own cadence (proposal: monthly during development, per-release after).

---

## 2. Init system

### 2.1 Options

| Option | What it is | State (as of writing) | Verdict |
|---|---|---|---|
| systemd | The thing Arch, XFCE packaging, NetworkManager, polkit, PipeWire, greetd and podman all assume | Mature | **Use for v1** |
| Write our own Rust PID 1 | A minimal PID 1 is ~500 lines (reap, signals, spawn supervisor). The *service manager* it needs is the real project | — | Defer; see §2.4 |
| `rustysd` | Rust reimplementation of a subset of systemd (unit files, socket activation) | Unmaintained since ~2021, no cgroups, no logind | Reject |
| `sysmaster` (openEuler) | Rust, systemd-unit-compatible init/service manager | Alive but developed for and by openEuler; no logind; partial unit compat | Watch, don't adopt |
| `rinit` | Rust, s6-style supervision | Early | Watch |
| OpenRC / runit / s6 / dinit | Not Rust; what Artix uses | Mature | Would not advance the goal |

### 2.2 What actually breaks with XFCE + NetworkManager + polkit if we drop systemd

Being specific, because "it works on Artix" hides the cost:

| Component | Dependency on systemd | Without systemd you need | Cost |
|---|---|---|---|
| XFCE session (logout/suspend/hibernate dialog), xfce4-power-manager | `org.freedesktop.login1` (logind) | **elogind** (C, a fork of logind) | Package + maintain; works |
| polkit | session tracking via logind | polkit built with `-Dsession_tracking=libelogind` | Rebuild polkit; works |
| NetworkManager | logind for session tracking; optional `systemd-resolved` | NM built for elogind; no resolved plugin; write your own `nm-online` ordering | Rebuild NM; works |
| PipeWire + WirePlumber | shipped as **user** services with socket activation | Start from XFCE autostart; lose socket activation → login-time races when apps start before the daemon | Fragile, fixable |
| udev | `systemd-udevd` | eudev, or extract udevd | Package + maintain |
| greetd | none (has OpenRC/runit units) | — | Fine |
| Rootless podman | cgroup v2 **delegation** via `systemd --user`; podman detects systemd to pick the cgroup manager | `--cgroup-manager=cgroupfs`; write our own delegation of `/sys/fs/cgroup/user.slice/...` | Resource limits in rootless mode become our problem |
| **Arch packaging itself** | pacman hooks call `systemd-sysusers`, `systemd-tmpfiles`, `systemctl daemon-reload`, `udevadm hwdb --update`, `journalctl --update-catalog` | Patch or replace every hook; ship `opentmpfiles`/`sysusers` replacements | **This is the big one.** Artix maintains hundreds of overlay packages purely to absorb this. |
| Timers, journal, tmpfiles, sysusers, machine-id, hostnamed, localed, timedated | systemd | cron, syslog, opentmpfiles, and D-Bus shims for the `*d` services that GUI settings dialogs talk to | Each one is small; there are a dozen |
| logind seat/VT handling for Wayland compositors (labwc/cage) | `libseat` → logind or `seatd` | `seatd` (C) | Fine |

Conclusion: dropping systemd on an Arch base is *becoming Artix*, plus writing a service manager. There is no Rust logind. That one missing piece alone blocks a desktop.

### 2.3 Recommendation

**Keep systemd for v1.** The mission is a Rust *userland*; the init/service-manager/logind/udev cluster is the single component where replacement multiplies the integration surface of every other package rather than adding one Rust binary. Spend that effort on the things users touch.

Rust *does* go into the boot path and the systemd periphery now:

| Slot | v1 choice | Notes |
|---|---|---|
| Initramfs `/init` | Phase 1–2: `mkinitcpio` (bash + busybox). **Phase 3: `ferris-initrd`, a static-musl Rust `/init`** (mount, `kmod`, udev trigger, LUKS unlock via libcryptsetup, `switch_root`) | This is where a hobby-scale Rust init is realistic and useful |
| Time sync | **`ntpd-rs`** instead of `systemd-timesyncd` | Mature, used in production, Rust |
| zram / swap | **`zram-generator`** (already Rust, ships with systemd ecosystem) | Free win |
| DNS | NetworkManager writes `/etc/resolv.conf` directly; `systemd-resolved` disabled | Avoids a resolver nobody needs; `hickory-dns` (Rust) is an option later for a local stub |
| D-Bus broker | `dbus-broker` (C) | `busd` (Rust, by the zbus authors) is experimental. Track it; do not ship it |
| Bootloader | `systemd-boot` (UEFI), `syslinux` (BIOS) | No usable Rust UEFI bootloader for Linux exists (`rust-osdev/bootloader` targets hobby kernels) |

### 2.4 The path to a Rust init, if we ever take it

Record it so it isn't re-litigated: the only design that doesn't fork the whole package base is a Rust PID 1 + service manager that **reads systemd unit files** (the subset Arch packages actually use) and **implements the `org.freedesktop.login1` D-Bus interface**. That's the requirement list. It's a Phase 6+ research track, and `sysmaster` is the closest existing code. It is explicitly not on the v1 critical path.

---

## 3. libc

### 3.1 The two angles you asked about

**Rust static linking.** `x86_64-unknown-linux-musl` gives fully static Rust binaries. That is valuable in exactly two places: the initramfs and a rescue toolset, where "one file, no dependencies" matters. It is *not* a reason to make the whole system musl, because:

- Rust binaries can target musl on a glibc host. `rustup target add x86_64-unknown-linux-musl` and we build `ferris-initrd` and a static uutils bundle for early userspace while the system stays glibc.
- Static musl Rust binaries can't use NSS. `ls -l`, `id`, `sudo`, `login`, `greetd`, anything PAM-adjacent needs `getpwnam` that honours `/etc/nsswitch.conf` (sssd, LDAP, systemd-userdb). Those must be dynamic glibc binaries anyway.
- musl's allocator is slow for allocation-heavy tools (partially fixable with mimalloc), and musl's locale support is minimal. A desktop OS with XFCE, GTK and `LC_COLLATE`-aware sorting wants glibc's locales.

**Proprietary binaries and kernel modules.**

- Kernel modules don't care about libc. Out-of-tree modules (NVIDIA, ZFS, VirtualBox, `broadcom-wl`) build against `linux-lts-headers` with the same GCC/Clang the kernel used. Either libc works for DKMS.
- Proprietary *userspace* is compiled against glibc: NVIDIA's userspace libraries (`libnvidia-*`, the Vulkan/EGL ICDs), Steam and its runtime, Chrome, VS Code, Zoom, Discord, Slack, Spotify, printer and scanner vendor drivers. On musl these need `gcompat`, which is a partial shim and fails on anything that touches `dlopen` of glibc-versioned symbols. NVIDIA's proprietary driver simply doesn't run on musl.

### 3.2 Recommendation

**glibc**, dynamic linking as the system default. Static musl target used only for `ferris-initrd`, the rescue tool bundle, and anything else that must run before `/usr` is mounted. This is consistent with §1 (Arch is glibc) and rules out Alpine.

Not a compromise of the Rust goal: Rust's `std` links against whichever libc is present. The userland is Rust either way; the libc underneath it isn't the point.

---

## 4. Package format and manager

### 4.1 Options

| Option | Pros | Cons |
|---|---|---|
| **Inherit pacman / ALPM** (`.pkg.tar.zst`, `repo-add` DBs, `makepkg`, hooks) | 15k Arch packages usable unchanged; archiso, devtools, `pkgctl`, `archlinux-repro` all work; multi-repo with per-repo signature policy is native; **Arch is itself rewriting ALPM tooling in Rust** (`alpm-types`, `alpm-srcinfo`, `alpm-buildinfo`, `alpm-pkginfo`, `alpm-mtree`, `alpm-package`…) so the format is gaining first-party Rust parsers | pacman itself is C; signing is GnuPG-centric; no delta updates; no transactional rollback |
| Own Rust package manager + format | Pure Rust; we control the trust model | Dependency solver, transactions, file-conflict detection, hooks, repo sync, DB format, signature verification, plus **re-packaging every dependency of XFCE** — years of work before anything boots. Would also cut us off from archiso and devtools. |
| Inherit pacman, Rust *frontend* | All of row 1 plus a UX we control and a second, independent signature check in Rust | Two layers to keep coherent |

### 4.2 Recommendation

**Inherit ALPM. Build `ferris-pkg`, a Rust CLI on top of libalpm via the `alpm` crate** (the same bindings `paru` is built on, so the approach is proven in a widely used tool).

Design points, so Phase 5 has a spec:

- **Backend:** libalpm through the `alpm` crate for transactions; `alpm-types`/`alpm-srcinfo`/`alpm-repo` crates from Arch's ALPM project for parsing where they are ready; shell out to `pacman` for nothing.
- **Signing:** packages and repo DBs signed with **sequoia `sq`** (Rust OpenPGP). Output is standard OpenPGP, so pacman's gpgme verification works unchanged, and `ferris-pkg` verifies the same signatures independently with `sequoia-openpgp`. One key per repo; keys shipped in a `ferris-keyring` package, mirroring `archlinux-keyring`.
- **Downloads:** `reqwest` with **rustls**, SHA-256 verified against the signed DB before libalpm ever sees the file.
- **Layered repos:** each package set is its own `[repo]` with its own key and `SigLevel = Required DatabaseRequired`. Priority is `pacman.conf` order. Proposed initial set:

  | Repo | Contents |
  |---|---|
  | `[ferris-core]` | Overrides: `coreutils` (uutils), `findutils` (uutils), `diffutils` (uutils), `sudo` (sudo-rs), `compat-*` packages, `ferris-*` tools, keyring |
  | `[ferris-desktop]` | XFCE defaults, theme, icons, wallpapers, greetd/ReGreet config, panel layout |
  | `[ferris-nonfree]` | `nvidia-lts`, `broadcom-wl-dkms` and similar; opt-in |
  | `[ferris-zfs]` | Prebuilt `zfs-linux-lts` matching our pinned kernel; opt-in (§7.2) |
  | `[core]`, `[extra]` | Arch Linux Archive snapshot, date-pinned |

  New package sets later = one more `[repo]` line and one more keyring entry. No monolithic list anywhere.

- **What `ferris-pkg` adds beyond pacman:** human-readable transaction preview, "what changed since last update" with links to our changelog, snapshot pinning (`ferris-pkg pin 2026-09-01`), a `--explain` for why a package is being pulled in, and `ferris-alt` integration for compat switching.

- **Own package manager:** not for v1. Revisit only if Arch's ALPM Rust project grows a transaction engine, in which case we adopt it rather than write our own.

---

## 5. Rust userland matrix

### 5.1 The hard rule, made concrete

Your rule: Rust tool is the default; the C original stays installed and reachable; no silent breakage; every deviation documented in `COMPATIBILITY.md`.

Mechanism (decision D-0009 in `DECISIONS.md`):

```
/usr/bin/ls  ->  /etc/ferris/alt/ls  ->  /usr/lib/ferris/rust/bin/ls      (uutils multicall)
                                    or  /usr/lib/ferris/compat/bin/ls     (GNU coreutils)
```

- The Rust package owns `/usr/bin/<tool>` (a stable symlink) and `/usr/lib/ferris/rust/bin/<tool>`.
- `compat-<pkg>` owns `/usr/lib/ferris/compat/bin/<tool>`. That directory is never on `PATH` by default.
- `/etc/ferris/alt/<tool>` is created by a pacman hook only if absent, so package upgrades never reset a user's choice. This is the Debian alternatives model.
- `ferris-alt <tool> rust|compat` and `ferris-alt --all compat` flip the middle link. `ferris-alt status` shows the table.
- Multicall dispatch uses `argv[0]`, which is what the caller typed, so the extra symlink hop is invisible.

Interactive-only conveniences (aliases in nushell/bash configs for `ls→eza`, `du→dust`, `cat→bat`) are allowed because non-interactive shells don't load them; scripts always get the POSIX name.

### 5.2 Per-tool verdicts

Legend — **Drop-in:** ships as the POSIX name. **Alongside:** ships under its own name, POSIX name stays a drop-in Rust or C tool. **Risk:** likelihood a common script notices.

| Target | Rust tool | Verdict | Risk | Notes |
|---|---|---|---|---|
| coreutils | **uutils/coreutils** | Drop-in as `/usr/bin/*` | Low–Medium | Passes the large majority of GNU's own test suite; Ubuntu 25.10 ships it as default and shook out most real-world breakage. Known gaps to document: locale-aware `sort` collation, some `dd`/`stty`/`pr` options, `--help` text format, SELinux flags. Built as one multicall binary. GNU kept as `compat-coreutils`. |
| findutils | **uutils/findutils** | Drop-in (`find`, `xargs`) | Medium | Less mature than coreutils; expression language mostly covered, some `-printf` directives and `-regextype` variants lag. `locate`/`updatedb` from `plocate` (C) stays. GNU kept as `compat-findutils`. |
| diffutils | **uutils/diffutils** | Drop-in (`diff`, `cmp`) | Medium | `diff3`/`sdiff` incomplete → those two names come from `compat-diffutils` even in the default configuration. `patch` is not diffutils; GNU `patch` stays (no Rust replacement). |
| grep | ripgrep | **Alongside as `rg`. `grep` stays GNU grep.** ⚠ Exception to the rule | High if aliased | `rg` uses Rust regex syntax (no BRE, no backreferences without PCRE2), recurses by default, honours `.gitignore`, skips hidden and binary files. A `grep` shim would either silently change regex semantics (that *is* silent breakage) or be a BRE→Rust-regex translator that doesn't exist and would be a project of its own. Recommendation: `rg` shipped and promoted in the interactive shell; `/usr/bin/grep` stays GNU. Revisit if uutils grows a `grep`. |
| find | fd | **Alongside as `fd`.** `find` = uutils findutils | None | `fd`'s CLI (`fd pattern [path]`) shares nothing with `find`'s expression language; a shim is infeasible. Since uutils `find` *is* Rust, we satisfy the rule without a shim. |
| cat / less | bat | `cat` = uutils (drop-in). `bat` alongside. **`less` stays C** ⚠ | None | `bat` *uses* `less` as its pager; there is no mature Rust pager binary (`minus` is a library). `PAGER` defaults to `less`; `bat` is the interactive `cat`. |
| ls | eza | `ls` = uutils (drop-in). `eza` alongside; interactive alias on | None | eza's flags differ (`--time-style`, sort flags, `-1`/`-d` edge cases). nushell's `ls` is a structured builtin anyway. |
| du / df | dust / duf | `du`,`df` = uutils (drop-in). `dust`,`duf` alongside; interactive alias on | None | Same pattern. |
| ps / top | procs / bottom | **Alongside as `procs`, `btm`. `ps`/`top` stay procps-ng (C)** ⚠ | None | `procs` and `btm` are not `ps`/`top` compatible. **uutils/procps** (Rust) exists and is early; per-tool adoption (`pgrep`, `pkill`, `free`, `uptime`, `w`, `watch` first, `ps`/`top` last) is a Phase 5 task once its test coverage is checked. |
| sed / awk | sd | **`sd` alongside. `sed` = GNU sed, `awk` = gawk (C)** ⚠ | None | `sd` is a find-and-replace tool, not a sed. uutils has an early `sed` effort; `frawk` is an incomplete awk. Neither is shippable as the POSIX name yet. Revisit uutils `sed` at Phase 5. |
| shell | nushell + dash/brush | **`nu` interactive via `ferris-login-shell` shim. `/bin/sh` = dash.** brush opt-in | Medium (see notes) | Real gotcha: `sshd`, `scp`, `rsync` and some GUI launchers run `$SHELL -c "cmd"` with the *login shell*. If that's `nu`, `ssh host 'a && b 2>&1'` is parsed by nushell and breaks. Fix: the account's login shell is a ~100-line Rust binary that `exec`s `nu` on an interactive TTY and `/bin/sh -c` otherwise. `bash` stays installed because `makepkg`, `mkinitcpio` and many Arch hooks require bash specifically. `brush` (Rust, bash-compatible) becomes the `/bin/sh` alternative once our own scripts pass under it in CI. |
| TLS | rustls | **All `ferris-*` tools: rustls.** System `curl` built with the rustls backend, OpenSSL-curl kept in compat. | Low | We do **not** attempt to remove OpenSSL/GnuTLS from the base: Python, NetworkManager, GTK's glib-networking, PipeWire's dependencies, sequoia's default crypto backend and dozens more link them. rustls goes where we control the code. |
| sudo | **sudo-rs** | Drop-in as `sudo`, `su`, `visudo` | Low–Medium | Ubuntu 25.10 default. Supports the common sudoers subset; unsupported directives (LDAP sudoers, some `Defaults`) are rejected loudly, not ignored. `compat-sudo` keeps the C sudo. Must be dynamic glibc (PAM, NSS). |
| SSH client/server | russh / thrussh | **Not viable. OpenSSH stays.** ⚠ | — | `russh` (successor of `thrussh`) is a protocol *library*, not a client or server program. No production-grade Rust `ssh`/`sshd` exists, and a home-grown sshd is a security liability, not a feature. Flagged as unsolved. |
| login / PAM | — | **Linux-PAM, shadow-utils, `login`/`agetty` stay C. greetd (Rust) becomes the login path users actually see.** | — | greetd + ReGreet on the graphical seat; greetd + `agreety`/`tuigreet` can own TTYs 2–6 so the Rust path covers text login too. `passwd`, `useradd`, `chpasswd` have no mature Rust replacement. polkit stays C. Not breaking auth is the priority. |
| Terminal | alacritty / wezterm | **alacritty** default; xfce4-terminal and wezterm installed | None | alacritty: steady releases, TOML config, GPU rendering, no tabs (XFCE users get tabs from the WM/tmux). wezterm: richer but its last stable tag is old and it lives on nightlies, a maintenance signal. Registered via `xdg-terminal-exec` and exo's preferred-applications so "Open Terminal Here" launches alacritty. |

### 5.3 Additional Rust swaps that come cheap (proposed defaults)

| Slot | Rust tool | Replaces |
|---|---|---|
| Time sync | ntpd-rs | systemd-timesyncd |
| Container runtime | **youki** (OCI runtime) as podman's default, `crun` fallback | crun |
| Audio mixer GUI | **pwvucontrol** (GTK4, PipeWire-native) | pavucontrol |
| zram | zram-generator | — |
| Fuzzy finder | skim (`sk`) | fzf |
| tldr | tealdeer | — |
| HTTP client | xh | httpie |
| Git diffs | delta | — |
| Prompt / cd | starship, zoxide | — |
| Vulkan on NVIDIA (open) | Mesa **NVK** (written in Rust) | comes with Mesa |
| System monitor GUI | resources (GTK4, Rust) — or none, XFCE task manager kept | — |

### 5.4 Things staying C that you should know about

Kernel, systemd, glibc, Xorg, Mesa (except NVK), GTK, all of XFCE, NetworkManager, iwd, wpa_supplicant, PipeWire, WirePlumber, polkit, dbus-broker, Linux-PAM, shadow, OpenSSH, util-linux (Rust reimplementation exists, early), procps-ng, GNU grep/sed/gawk/less/patch/bash, cryptsetup and LUKS tooling (we use its Rust bindings), e2fsprogs/btrfs-progs, nftables, podman (Go), labwc/cage (C, wlroots), git (gitoxide is not ready for daily use), bootloaders, mkinitcpio (until Phase 3). All listed in `COMPATIBILITY.md` under "Not replaced".

---

## 6. Desktop decisions

| Topic | Decision | Reasoning |
|---|---|---|
| XFCE version | 4.20 (current stable as of writing; re-check for 4.22 at Phase 2 start) | — |
| X11 session | Default and guaranteed. `xfwm4` + full XFCE | `xfwm4` is not Wayland-capable |
| Wayland session | Shipped as **experimental** greeter entry: `labwc` + `xfce4-session`, `xfce4-panel` and `xfdesktop` in their layer-shell modes | XFCE 4.20's Wayland support is partial; screensaver, some settings dialogs and xfwm4 are X11-only. Honest label, no promises. |
| Display manager | **greetd + ReGreet** (GTK4, Rust) running under `cage`; LightDM packaged as fallback | Both Rust; ReGreet gives session choice and theming. Costs: no user switching, no XDMCP, no a11y greeter. Live ISO uses greetd `initial_session` autologin. `light-locker` needs LightDM, so the lock screen is `xfce4-screensaver`. |
| Network | NetworkManager, **iwd** backend, keyfile plugin, `wpa_supplicant` installed as fallback | iwd backend is supported by NM; a few enterprise EAP setups and hotspot mode behave differently. NM natively handles bridge/VLAN/veth; veth is unmanaged by default so podman and our tooling don't fight it (§7.5). |
| Audio | PipeWire + WirePlumber + pipewire-pulse/alsa/jack; **pwvucontrol** mixer | Standard stack; Rust mixer |
| Terminal | alacritty default (§5.2) | — |
| Look | Custom GTK theme (GTK2/3 for XFCE, GTK4 for ReGreet/pwvucontrol), icon theme, wallpapers, panel layout as a `ferris-desktop-defaults` package writing `xfconf` defaults + `/etc/xdg` | Phase 4; a rebranded stock XFCE is explicitly not the target |

---

## 7. System architecture decisions

### 7.1 Kernel

- `linux-lts` + `linux-lts-headers` from the snapshot. Full `linux-firmware` meta-package (Arch split it into per-vendor subpackages in 2025; we install the meta so nothing is missing), `sof-firmware`, `intel-ucode`, `amd-ucode`, `b43-fwcutter`.
- `base-devel` + `dkms` installed so out-of-tree modules build on the installed system and in the live session.
- **Custom kernel swap, documented path:** build with a PKGBUILD (`linux-custom`), install alongside `linux-lts`; `mkinitcpio` presets generate an initramfs per kernel; `ferris-boot` (small Rust tool, Phase 3) regenerates `systemd-boot` entries from `/usr/lib/modules/*` so a new kernel appears in the menu without hand-editing. Fallback entry always kept.

### 7.2 Filesystems and encryption

- Installer offers ext4, btrfs, and ZFS. LUKS2 via `libcryptsetup-rs`. GPT via the `gpt` crate; no `parted`/`sfdisk` shelling.
- **ZFS is the hard one:** out-of-tree, CDDL, and must match the pinned LTS kernel. Plan: `[ferris-zfs]` repo with a prebuilt `zfs-linux-lts` built against the exact snapshot kernel (the archzfs model). The live ISO loads it only when the user picks ZFS. Root-on-ZFS with native encryption *or* LUKS. Flagged as best-effort in v1: if the ZFS release lags the kernel, the option greys out rather than breaking.

### 7.3 Boot

- UEFI: `systemd-boot` with unified kernel images (UKI) built by `mkinitcpio --uki`. Legacy BIOS: `syslinux` on the ISO and installed systems (archiso's arrangement).
- **Secure Boot path (documented, unsigned at first):** `shim` (Microsoft-signed) → MOK-enrolled FERRIS key → signed `systemd-boot` and signed UKIs. Signing with `sbsigntools` initially; a Rust signer using the `authenticode` crate is a Phase 5 stretch. Until we have a signing key ceremony, the ISO boots with Secure Boot **off**, and the installer offers to enrol the key via `sbctl`-style MOK flow.
- Live ISO: squashfs root + optional **encrypted persistence** (LUKS2 container on the USB, discovered by label, overlayfs upper). Implemented in the Rust `/init` in Phase 3; Phase 1 uses archiso's `cow` persistence mechanism as a stepping stone.

### 7.4 Containers

- podman rootless out of the box: `newuidmap`/`newgidmap`, `pasta` (passt) for networking, native rootless overlayfs (kernel ≥ 5.13), cgroup v2 only.
- systemd user-slice delegation configured (`user@.service.d/delegate.conf`: `Delegate=cpu cpuset io memory pids`) so rootless resource limits work.
- Default OCI runtime: **youki** (Rust); `crun` installed as fallback via `containers.conf`.

### 7.5 Networking and firewall

- nftables as the only firewall layer; no firewalld, no iptables-legacy. `iptables-nft` shim installed for software that hard-codes `iptables`.
- **`ferris-fw`** (Rust, Phase 5): generates and applies nftables rulesets via libnftables' JSON API (`nftables` crate), with profiles (home/public/server), per-app allow rules, and a `--dry-run` diff. Podman's own nft tables are namespaced and left alone.
- Bridges, VLANs, veth, multi-interface: managed through NetworkManager connection profiles; `ferris-ctl` exposes them. NM `unmanaged-devices` covers interfaces created outside NM. No `systemd-networkd` to avoid two managers.

### 7.6 Repositories

Layered signed repos as in §4.2. Infrastructure is static files: `repo-add`-style DBs + detached sequoia signatures, served from any HTTP host or object store. Mirroring is `rsync`/`rclone`. No server-side software.

### 7.7 ARM64 later

Nothing chosen above is x86-only except `syslinux`/BIOS and `intel-ucode`/`amd-ucode`. Arch Linux ARM is a separate project with its own archive, so an ARM64 port means a second snapshot source; the orchestrator takes the architecture and snapshot URL as inputs from day one.

### 7.8 Reproducible builds

Goal from day one; here is what's achievable when:

| Layer | Mechanism | Phase | Honest status |
|---|---|---|---|
| Package set | ALA date + lockfile (name, version, SHA-256) written by `ferris-build`, checked into git | 1 | Solved |
| Our packages | Clean-chroot builds (`devtools`), `SOURCE_DATE_EPOCH`, `cargo --locked`, vendored crates with checksummed source tarballs, `--remap-path-prefix` | 1 | Solved; verified with `archlinux-repro` |
| Root filesystem (squashfs) | `pacstrap` from lockfile only; empty `/etc/machine-id`; deterministic `ld.so.cache`, font/pixbuf/mime caches regenerated with fixed epoch; `mksquashfs` with `SOURCE_DATE_EPOCH` | 1 (hash-stable squashfs is the Phase 1 gate) | Expected to work; caches are the usual culprits |
| Initramfs | `mkinitcpio` honours `SOURCE_DATE_EPOCH`; our Rust `/init` is a static binary | 1 / 3 | Expected to work |
| ISO image | `xorriso` with fixed volid, `--set_all_file_dates`, sorted file order | 1 (stretch), 5 (gate) | archiso's support is partial; `ferris-build` owns this step |
| Verification | `diffoscope` on two independent CI builds of the same commit | 5 | — |

Bit-identical ISOs on two machines from the same commit is the **Phase 5 acceptance test**. Phase 1 requires a bit-identical *squashfs*; the ISO wrapper may differ until the xorriso step is nailed down.

### 7.9 CI

GitHub Actions, one job in an `archlinux:base-devel` container run `--privileged` (pacstrap needs bind mounts). `ferris-build` is the only entry point; CI runs the same command a developer runs.

---

## 8. Custom Rust components — the crate list

One Cargo workspace, `ferris-os/crates/`. Names are working names.

| Crate | Phase | Scope | Key crates | Notes |
|---|---|---|---|---|
| `ferris-build` | 1 | ISO build orchestrator: resolve snapshot → lockfile → pacstrap → squashfs → initramfs → ISO. One command, CI-runnable | `clap`, `serde`, `reqwest`+rustls, `sha2` | Phase 1 wraps `mkarchiso`; Phase 5 subsumes it (mkarchiso is ~2k lines of bash and the pipeline is small) |
| `ferris-alt` | 1 | Alternatives switcher (§5.1) | `clap` | Tiny |
| `ferris-login-shell` | 1 | Login-shell shim: interactive → `nu`, `-c` → `/bin/sh` | `nix` | ~100 lines |
| `ferris-install` | 3 | TUI installer: disks, GPT, LUKS2, ext4/btrfs/zfs, locale, users, bootloader, snapshot-pinned pacstrap | `ratatui`, `libcryptsetup-rs`, `gpt`, `nix` | GUI (`gtk4-rs`/`relm4`) later, sharing a `ferris-install-core` lib |
| `ferris-initrd` | 3 | Static musl `/init` for the initramfs: mounts, `kmod`, udev trigger, LUKS unlock, persistence overlay, `switch_root` | `nix`, `libcryptsetup-rs`, `kmod` bindings | Replaces busybox early userspace |
| `ferris-boot` | 3 | Regenerate `systemd-boot` entries / UKIs from installed kernels | — | Small |
| `ferris-firstboot` | 4 | First-boot wizard: hostname, keyboard, timezone, hardening toggles (firewall profile, sshd off, USBGuard-style policy) | `ratatui` first, GTK later | — |
| `ferris-ctl` | 4–5 | System control panel: services (via `zbus` → systemd), users, firewall (via `ferris-fw`), NM profiles (via `zbus` → NM), kernel params (`/etc/kernel/cmdline` + sysctl) | `ratatui`, `zbus`, later `relm4` | TUI first |
| `ferris-pkg` | 5 | Package CLI over libalpm (§4.2) | `alpm`, `alpm-types`, `sequoia-openpgp`, `reqwest` | — |
| `ferris-fw` | 5 | nftables profile manager (§7.5) | `nftables`, `serde_json` | — |

Everything is a library crate plus a thin binary so the GUI and TUI share logic.

---

## 9. Genuinely hard or unsolved (not papered over)

1. **No Rust SSH server or client program.** OpenSSH stays. Nothing to do but wait.
2. **No Rust logind, udev, or service manager worth shipping.** This is what keeps systemd (§2). A Rust init means writing `login1` and reading unit files.
3. **`grep`, `sed`, `awk`, `less`, `ps`, `top` have no drop-in Rust replacements.** The "modern" tools are different tools. Aliasing them onto the POSIX names *is* the silent breakage your rule forbids. I'm asking you to sign off on keeping these C for now (§12).
4. **Bit-identical ISO.** Squashfs determinism is tractable; the xorriso/El Torito layer and mkinitcpio's cpio need care. Phase 1 gates on the squashfs hash, Phase 5 on the whole image.
5. **ZFS on a pinned LTS kernel.** Solvable with a prebuilt module repo, but it's a recurring maintenance chore and a licensing decision (shipping a CDDL module on the ISO). Opt-in repo, best-effort.
6. **greetd's gaps.** No user switching, no accessibility greeter, no XDMCP. If any of those become requirements, LightDM comes back as the default.
7. **XFCE on Wayland** is experimental upstream and will stay labelled that way in our greeter until XFCE ports `xfwm4` or a compositor becomes an official XFCE component.
8. **nushell as login shell** needs the shim described in §5.2; without it, remote commands break.
9. **Secure Boot** needs a key ceremony and secret handling in CI before we sign anything. Shipping unsigned in v1 with the enrolment path documented.
10. **uutils gaps are moving targets.** Ubuntu's 25.10 bug tracker is the best list of real-world breakage; `COMPATIBILITY.md` will track the ones that affect us, re-checked at every snapshot bump.

---

## 10. What "reproducible from day one" costs you

Snapshot pinning means the development ISO is deliberately behind Arch. Security fixes reach FERRIS when we bump the snapshot, not when Arch publishes them. During development that's a monthly bump; for a release it's a deliberate act with a changelog. This is the correct trade for a distro whose artifacts must be reproducible, but it's a trade.

---

## 11. Phase plan with acceptance tests

| Phase | Deliverable | Build command | Test you run |
|---|---|---|---|
| 0 | This document, `DECISIONS.md`, `COMPATIBILITY.md` | — | You sign off §12 |
| 1 | Bootable live ISO, no desktop. uutils coreutils/findutils/diffutils and sudo-rs as defaults, compat layout, `ferris-alt`, dash `/bin/sh`, nushell via the shim, `ferris-build` producing a lockfile and a hash-stable squashfs | `cargo run -p ferris-build -- iso --profile minimal` | Boot in QEMU (UEFI and BIOS); `ls --version` says uutils; `ferris-alt ls compat && ls --version` says GNU; `sudo -V` says sudo-rs; run a POSIX script under `/bin/sh`; build twice, `sha256sum` of `airootfs.sfs` matches |
| 2 | XFCE session boots from live ISO. X11 guaranteed, Wayland entry experimental. NM+iwd, PipeWire, greetd+ReGreet autologin, alacritty, full firmware | `... iso --profile desktop` | Boot in QEMU with virtio-gpu and on one real laptop: Wi-Fi connects, audio plays, `nmcli`, `wpctl status`, both sessions start |
| 3 | `ferris-install` TUI: GPT + LUKS2 + ext4/btrfs, user, `systemd-boot`; `ferris-initrd`; installed system boots from disk | `cargo build --release -p ferris-install` | Install into a QEMU disk with LUKS; reboot; unlock; land in XFCE; persistence works on a USB image |
| 4 | Theme, icons, wallpaper, panel layout, branding, `ferris-firstboot`, `ferris-ctl` TUI | `... iso --profile desktop` | Fresh install → first-boot wizard → desktop looks like ours, not stock |
| 5 | `ferris-pkg`, sequoia-signed `[ferris-*]` repos, `ferris-fw`, CI building the ISO, `diffoscope`-clean double build | `ferris-build release --snapshot YYYY-MM-DD` | Two CI runs on the same commit produce the same ISO SHA-256; `ferris-pkg` refuses an unsigned package |

---

## 12. Sign-off checklist

Reply with the numbers you accept, and alternatives for any you don't.

1. Base: Arch + archiso, ALA snapshot pinning, overlay repos.
2. Init: systemd for v1; Rust `/init` in initramfs (Phase 3); Rust init as a Phase 6+ research track.
3. libc: glibc; musl static only for early userspace and rescue tools.
4. Packages: inherit ALPM; `ferris-pkg` Rust frontend; sequoia signing; layered repos as listed.
5. **Exceptions to the hard rule:** `grep`, `sed`, `awk`, `less`, `ps`, `top`, `patch`, `diff3`/`sdiff`, `ssh`/`sshd`, `login`/`passwd` stay C, with the Rust alternatives shipped alongside under their own names. Rationale in §5.2 and §9.
6. Shell: nushell interactive via the `ferris-login-shell` shim; `/bin/sh` = dash; brush opt-in.
7. Display manager: greetd + ReGreet, LightDM packaged as fallback.
8. Terminal: alacritty default.
9. Compat layout under `/usr/lib/ferris/{rust,compat}/bin` with `/etc/ferris/alt` links.
10. ZFS as an opt-in repo, best-effort in the installer.
11. Repo layout: everything under `ferris-os/` in this repository, Cargo workspace in `ferris-os/crates/`. (This repo also holds unrelated projects; a dedicated repository would be cleaner, your call.)
12. Codename: keep FERRIS-OS through Phase 3; run a name-collision check before branding in Phase 4.

On sign-off, Phase 1 starts with the `ferris-build` crate and the `minimal` archiso profile.
