// Jarvis — Telegram <-> Claude Code bridge.
// Runs under Bun. Receives Telegram messages from allowlisted users, spawns
// `claude -p "<prompt>" --dangerously-skip-permissions` in WORK_DIR, and
// sends the output back to the chat.

import { Bot, type Context } from "grammy";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s));
const WORK_DIR = process.env.WORK_DIR ?? "/home/jarvis/workspace";
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}
if (ALLOWED_IDS.length === 0 || ALLOWED_IDS.some((id) => !Number.isFinite(id))) {
  console.error(
    "TELEGRAM_ALLOWED_USER_IDS must be a comma-separated list of numeric user IDs — refusing to start",
  );
  process.exit(1);
}

const bot = new Bot(TOKEN);

// Allowlist: silently drop anything not from an approved user ID. This is the
// only thing standing between a stranger and code execution as `jarvis`.
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (uid === undefined || !ALLOWED_IDS.includes(uid)) {
    console.warn(
      `[denied] uid=${uid} username=${ctx.from?.username ?? "?"} text=${
        ctx.message?.text?.slice(0, 80) ?? ""
      }`,
    );
    return;
  }
  await next();
});

// Single-slot queue so two prompts can't run at the same time and trample
// each other's files in WORK_DIR.
let busy = false;
const queue: Array<() => Promise<void>> = [];
function enqueue(task: () => Promise<void>) {
  queue.push(task);
  void drain();
}
async function drain() {
  if (busy) return;
  const task = queue.shift();
  if (!task) return;
  busy = true;
  try {
    await task();
  } finally {
    busy = false;
    void drain();
  }
}

bot.command("start", (ctx) =>
  ctx.reply(
    `Jarvis here. Send me a prompt and I'll run it through Claude Code in ${WORK_DIR}.\n\nCommands: /help /cwd /status`,
  ),
);
bot.command("help", (ctx) =>
  ctx.reply(
    "Send any text and I'll treat it as a Claude Code prompt.\n\n" +
      "/cwd — show working directory\n" +
      "/status — show queue status",
  ),
);
bot.command("cwd", (ctx) => ctx.reply(`Working dir: ${WORK_DIR}`));
bot.command("status", (ctx) =>
  ctx.reply(busy ? `Busy. ${queue.length} queued.` : `Idle. ${queue.length} queued.`),
);

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return; // slash commands handled above

  enqueue(async () => {
    let typingTimer: ReturnType<typeof setInterval> | undefined;
    try {
      await ctx.replyWithChatAction("typing");
      typingTimer = setInterval(() => {
        ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});
      }, 4000);

      const proc = Bun.spawn({
        cmd: [CLAUDE_BIN, "-p", text, "--dangerously-skip-permissions"],
        cwd: WORK_DIR,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, HOME: process.env.HOME ?? "/home/jarvis" },
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const code = await proc.exited;

      const body = stdout.trim() || stderr.trim() || "(no output)";
      const prefix = code === 0 ? "" : `[exit ${code}]\n\n`;
      await sendChunked(ctx, prefix + body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("handler error:", msg);
      await ctx.reply(`Error: ${msg}`).catch(() => {});
    } finally {
      if (typingTimer) clearInterval(typingTimer);
    }
  });
});

// Telegram caps messages at 4096 chars; leave headroom for prefixes.
async function sendChunked(ctx: Context, text: string) {
  const MAX = 4000;
  if (text.length <= MAX) {
    await ctx.reply(text);
    return;
  }
  for (let i = 0; i < text.length; i += MAX) {
    await ctx.reply(text.slice(i, i + MAX));
  }
}

console.log(
  `jarvis-bot starting | workdir=${WORK_DIR} | allowed=${ALLOWED_IDS.join(",")}`,
);
bot.start({
  onStart: (me) => console.log(`connected as @${me.username} (id ${me.id})`),
});
