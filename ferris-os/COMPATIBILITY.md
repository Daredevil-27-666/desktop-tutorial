# FERRIS-OS — Compatibility notes

Every deviation from GNU/POSIX behaviour that a user or script could notice is recorded here.
Policy: the Rust tool owns the POSIX name in `/usr/bin`; the C original is always installed at
`/usr/lib/ferris/compat/bin/`; `ferris-alt <tool> compat` switches a single tool back;
`ferris-alt --all compat` switches everything back. No tool is removed, ever.

This file is updated at every snapshot bump and every time a Phase lands. Phase 0 seeds it with
the known deviations; entries marked *to verify* get confirmed against the pinned versions in Phase 1.

## 1. Layout

| Path | Owner | On default `PATH`? |
|---|---|---|
| `/usr/bin/<tool>` | Rust package (symlink to `/etc/ferris/alt/<tool>`) | yes |
| `/etc/ferris/alt/<tool>` | created by hook, managed by `ferris-alt` | — |
| `/usr/lib/ferris/rust/bin/<tool>` | Rust package | no |
| `/usr/lib/ferris/compat/bin/<tool>` | `compat-<pkg>` | **no** |

Scripts that hard-code `/usr/bin/ls` get the Rust tool. That is intended and is why the table below exists.

## 2. Rust defaults under POSIX names

| Name(s) | Default implementation | Compat package | Known deviations (to verify against pinned version in Phase 1) |
|---|---|---|---|
| coreutils (`ls`, `cp`, `mv`, `rm`, `sort`, `date`, `dd`, `stat`, …) | uutils/coreutils | `compat-coreutils` (GNU) | `sort`: locale collation (`LC_COLLATE`) may differ from GNU for non-C locales. `dd`: some conversion flags. `stty`, `pr`: incomplete option coverage. `--help`/`--version` text differs (scripts parsing it break). SELinux-specific flags absent. `date`: format edge cases. `cp --reflink` behaviour on some filesystems. |
| findutils (`find`, `xargs`) | uutils/findutils | `compat-findutils` (GNU) | Some `-printf` directives and `-regextype` values unsupported; `-fprint*` family partial. `locate`/`updatedb` come from `plocate` (C), unchanged. |
| diffutils (`diff`, `cmp`) | uutils/diffutils | `compat-diffutils` (GNU) | Some output-format options incomplete. **`diff3` and `sdiff` are provided by the GNU package even in the default configuration.** `patch` is GNU patch. |
| `sudo`, `su`, `visudo` | sudo-rs | `compat-sudo` (C sudo) | sudoers: no LDAP sudoers, subset of `Defaults`, no plugins. Unsupported directives fail loudly. `sudoedit` support to verify at pinned version. `su` from sudo-rs replaces util-linux `su`. |
| `/bin/sh` | dash | — (bash always installed) | Not bash. Scripts with bashisms and a `#!/bin/sh` shebang fail, as on Debian. `brush` selectable via `ferris-alt sh brush`. |
| login shell (new users) | `ferris-login-shell` → nushell | `chsh -s /bin/bash` | Interactive TTY gets nushell; `$SHELL -c` (ssh remote commands, scp, rsync, GUI launchers) gets `/bin/sh`. `$SHELL` reports the shim path. Setting `nu` directly as login shell breaks `ssh host 'a && b 2>&1'`. |
| time sync | ntpd-rs | `systemd-timesyncd` (disabled, present) | Different config file (`/etc/ntpd-rs/ntp.toml`); `timedatectl` still reports sync state via the `timesync1` interface only when timesyncd runs. |
| OCI runtime for podman | youki | `crun` | Select with `--runtime crun` or in `containers.conf`. |

## 3. Rust tools shipped alongside, POSIX name unchanged

| POSIX name (stays C) | Rust tool shipped | Why not swapped |
|---|---|---|
| `grep` | `rg` | Rust regex syntax, no BRE, recursive by default, honours `.gitignore`, skips hidden/binary. |
| `sed` | `sd` | Different tool (find/replace), not a stream editor. uutils `sed` tracked. |
| `awk` | — | No POSIX-complete Rust awk. |
| `less` | `bat` (uses `less` as its pager) | No Rust pager binary. |
| `ps`, `top` | `procs`, `btm` | Different output/flags. uutils/procps tracked per tool. |
| `find` | `fd` | `find` itself *is* Rust (uutils). `fd` is a different CLI. |
| `du`, `df`, `ls`, `cat` | `dust`, `duf`, `eza`, `bat` | POSIX names are uutils (Rust). Interactive aliases only. |
| `ssh`, `sshd`, `scp`, `sftp` | none | No Rust implementation exists. |
| `login`, `agetty`, `passwd`, `useradd` | `greetd` (+ `agreety`/`tuigreet`) covers login on seats/TTYs | No Rust shadow-utils. |
| `curl` | `curl` built with rustls backend (default), OpenSSL build in compat | Some `--engine`/OpenSSL-specific options unavailable with rustls. |

## 4. Interactive-only aliases (set in nushell and bash rc files, never active in scripts)

| Alias | Target |
|---|---|
| `ls` | `eza` (in bash; nushell's `ls` is its own builtin) |
| `cat` | `bat --paging=never` |
| `du` | `dust` |
| `df` | `duf` |
| `top` | `btm` |

## 5. Not replaced (C or other, by decision)

Kernel, systemd, glibc, Xorg, Mesa (NVK excepted), GTK, XFCE, NetworkManager, iwd, wpa_supplicant,
PipeWire, WirePlumber, polkit, dbus-broker, Linux-PAM, shadow, OpenSSH, util-linux, procps-ng,
GNU grep/sed/gawk/less/patch/bash, cryptsetup, e2fsprogs, btrfs-progs, nftables, podman (Go),
labwc, cage, git, systemd-boot, syslinux, mkinitcpio (until `ferris-initrd`, Phase 3).
See `docs/PHASE-0-DECISIONS.md` §5.4 and §9 for why.
