# Flux — Implementation Guide (Beginner Edition)

**Project:** Flux
**Status:** Ideation / Pre-Alpha
**Document version:** 0.1 (Draft)
**Last updated:** August 25, 2026
**Related documents:** PRD.md · TRD.md · ARCHITECTURE.md · PHASES.md · RULES.md · GUIDE.md

---

## Before You Start

This guide is different from the other files in this set. PRD.md, TRD.md, ARCHITECTURE.md, PHASES.md, and RULES.md are written like a spec — dense, precise, meant for people who already know the vocabulary. This one is written to actually teach you, one small step at a time, assuming almost nothing.

**What we assume you already know:** basic JavaScript (variables, functions, `if` statements), and that you've opened a terminal before — even just to type `npm install` once.

**What we don't assume you know, and explain from zero:** TypeScript, monorepos, WebSockets, Server-Sent Events, CRDTs, JSON Patch, sanitization, signed tokens, or anything else specific to this project. If a word is new, we stop and explain it before using it.

**Be honest with yourself about pace.** Flux touches real-time networking, a genuinely advanced data-syncing technique (CRDTs), custom parsing, and security-sensitive approval flows. PHASES.md budgets 16 weeks for an experienced team. As a beginner learning the ideas as you go, give yourself more room than that — there's no shame in it taking longer. The goal of this guide is to get every concept to actually click, not to rush you to the finish line.

---

## Part 1 — Get Your Computer Ready

Before writing any code, you need four tools installed. Here's what each one is and why you need it.

### 1. Node.js
**What it is:** normally, JavaScript only runs inside a web browser. Node.js lets JavaScript run directly on your computer, outside a browser — which is what lets it power a server.
**Why we need it:** Flux has a server half and a browser half. Node.js runs the server half, and also runs the tools (like npm) we use to build everything.
**How to get it:** go to **nodejs.org** and download the version labeled **LTS** (Long Term Support) — that's the safe, stable choice for most people.
**Check it worked:** open a terminal and type:
```bash
node --version
```
If you see a version number (like `v22.x.x`), you're good.

### 2. A code editor
**What it is:** a text editor built for writing code (autocomplete, error highlighting, etc.), instead of Notepad or TextEdit.
**Recommendation:** **VS Code** (free, from Microsoft) — download it from **code.visualstudio.com**.

### 3. Git
**What it is:** a tool that tracks changes to your code over time, so you can undo mistakes and collaborate with others.
**How to get it:** download from **git-scm.com**, or on Mac, just run `git --version` in a terminal — it may prompt you to install it automatically.

### 4. pnpm
**What it is:** a tool for installing other people's code packages (like `npm`, which you may have heard of — pnpm is a faster, more disk-space-efficient alternative that does the same job). We'll use it because it's the standard choice for the kind of multi-package project (a "monorepo," explained below) that Flux is.
**How to get it:** once Node.js is installed, run:
```bash
npm install -g pnpm
```
**Check it worked:**
```bash
pnpm --version
```

That's it — you're ready.

---

## Part 2 — Words You'll Keep Seeing

A quick glossary. Skim it now, come back to it later.

| Word | Plain-language meaning |
|---|---|
| **Terminal** | A text-based window where you type commands instead of clicking buttons. |
| **Package** | A chunk of code someone else wrote that you can reuse, instead of writing it yourself. |
| **npm install X** | "Download package X and make it available in my project." |
| **Repository ("repo")** | A folder whose history is tracked by Git. |
| **Monorepo** | One repo that holds *several* related packages together (in Flux's case: the core library, plus a Vue version, a Svelte version, a Solid version, and a CLI tool), instead of scattering them across separate repos. |
| **TypeScript** | JavaScript, plus an extra layer where you declare what *type* of data (number, string, etc.) each variable holds. The computer then double-checks your code for you before it even runs. Flux's real codebase uses this (see RULES.md), but for learning, we'll write plain JavaScript first — it's faster to experiment with, and adding TypeScript later is mostly just labeling what you already wrote. |
| **Client vs. Server** | The **client** is the code running in the user's browser (what they see and click). The **server** is the code running elsewhere (on a computer you control) that the client talks to. |
| **API** | An agreed-upon way for two pieces of software to talk to each other. |
| **Framework (Vue / Svelte / Solid)** | A toolkit for building the visual, clickable part of a website. Flux supports all three, plus plain JavaScript. |

---

## Part 3 — The Big Picture, in Plain English

Before touching code, let's understand *what* we're building, with an analogy.

**Imagine a restaurant.** The **customer** (browser) sits at a table. The **waiter** (server) carries messages back and forth. The **chef** (the AI agent) is in the kitchen, deciding what to cook.

Normally, the customer orders once, the waiter delivers it, and the chef makes the whole dish before anything comes out. Flux is for a stranger situation: the chef is *talking out loud while cooking* — describing the dish token by token before it's finished — and the customer might want to change their order mid-cook, or the chef might need to say "wait, should I really put the expensive truffle on this? Let me check with the customer first."

That's four real problems, and Flux gives each one its own building block:

1. **The Messenger** *(Transport)* — how words travel back and forth between kitchen, waiter, and table, without one message getting stuck behind another.
2. **The Shared Notebook** *(State Engine)* — a notebook that the customer and the kitchen can both scribble in at the same time, and it never gets confused about whose scribble is "the real one."
3. **The Paintbrush** *(Renderer)* — turns the chef's half-finished description into an actual picture on the table (a button, a card, a form) *safely*, even while the chef is still talking.
4. **The Pause Button** *(HITL — Human-in-the-Loop)* — lets the chef stop and ask "are you sure?" before doing something expensive or risky, and only continue once a real person says yes.

We'll build these one at a time, in that order, because each one is easier to understand once the one before it exists.

---

## Part 4 — Phase 0: Small, Safe Experiments First

**Why:** before building "for real," we test the two riskiest ideas in tiny throwaway scripts. If something doesn't work the way we expect, we want to find out in five minutes, not five weeks in.

Make a new folder for experiments:
```bash
mkdir flux-experiments && cd flux-experiments
npm init -y
```

You'll run the small experiments below inside this folder as you go through this guide. Nothing here needs to be "correct" forever — it's just for learning.

---

## Part 5 — Phase 1: Build the Messenger (Transport)

### The idea, explained simply

There are two ways messages travel in Flux:

- **Server-Sent Events (SSE)** — a one-way stream from server to browser. Think of it like a radio broadcast: the kitchen keeps talking, and the table just listens.
- **WebSocket** — a two-way connection. Think of it like a walkie-talkie: either side can talk, any time.

Flux uses SSE for the agent talking *to* you (streaming words and UI), and WebSocket for you talking back (clicking things, approving actions). We wrap both together into one thing we call `FluxTransport`.

### Step 1: Try SSE by itself

Save this as `sse-server.js`:
```js
const http = require('http');

http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    let count = 0;
    const timer = setInterval(() => {
      count++;
      res.write(`id: ${count}\n`);
      res.write(`data: Hello number ${count}\n\n`);
    }, 1000);

    req.on('close', () => clearInterval(timer));
  }
}).listen(3000, () => console.log('Listening on http://localhost:3000'));
```
Run it:
```bash
node sse-server.js
```
Then, in a browser console (open any webpage, press F12, go to the Console tab), run:
```js
const source = new EventSource('http://localhost:3000/events');
source.onmessage = (event) => console.log('Got:', event.data);
```
**Checkpoint:** you should see `Got: Hello number 1`, `Got: Hello number 2`, and so on, once per second, in the browser console. That's one-way streaming — the same trick that lets Flux stream an AI's words to the screen live.

### Step 2: Try WebSocket by itself

Install the `ws` package:
```bash
npm install ws
```
Save this as `ws-server.js`:
```js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', (socket) => {
  console.log('A browser connected!');
  socket.on('message', (message) => {
    console.log('Got from browser:', message.toString());
  });
});
```
Run it, then in the browser console:
```js
const socket = new WebSocket('ws://localhost:3001');
socket.onopen = () => socket.send('Hello server!');
```
**Checkpoint:** your terminal running `ws-server.js` should print `A browser connected!` and then `Got from browser: Hello server!`. That's two-way messaging.

### Step 3: Understand the "envelope" idea

Once both channels work, we need a consistent shape for every message so the receiving side always knows what kind of message it just got. TRD.md calls this a `FluxEnvelope`. In plain terms, every message is a small labeled box:
```js
{
  id: 'msg-42',        // a unique name for this message
  type: 'text.delta',  // what kind of message this is
  seq: 12,              // its position in order, for this type only
  payload: 'Hello'      // the actual content
}
```
Labeling every message this way is what lets Flux mix text, UI updates, and tool-call events on the same connection without one type getting stuck behind another — the receiving side just sorts incoming boxes by their `type` label into separate piles.

**What "done" looks like for this phase:** you can send labeled messages over SSE and WebSocket, and reconnect after killing and restarting the server without losing your place (a more advanced step — for now, just get comfortable with the two channels above).

---

## Part 6 — Phase 2: Build the Shared Notebook (State)

### The idea, explained simply

Imagine two people editing the same shopping list from two different phones, at the same time, with no internet connection between them for a minute. When they reconnect, you don't want either person's item to just vanish. You want *both* changes kept.

That's exactly the problem a **CRDT** (Conflict-free Replicated Data Type) solves. It's a special kind of data structure that *always* knows how to merge two different versions of itself back together, with no data loss, and without you writing any merge logic yourself.

Flux uses a CRDT library called **Yjs** for this.

### Step 1: See a CRDT merge with your own eyes

Install Yjs:
```bash
npm install yjs
```
Save this as `crdt-demo.js`:
```js
const Y = require('yjs');

const docA = new Y.Doc();
const docB = new Y.Doc();

// Give both "phones" the same starting list
docA.getArray('list').push(['milk', 'eggs']);
Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

console.log('A starts with:', docA.getArray('list').toArray());
console.log('B starts with:', docB.getArray('list').toArray());

// Now they go "offline" and each person adds something different,
// at the same moment:
docA.getArray('list').push(['bread']);
docB.getArray('list').push(['bananas']);

// They come back online and swap what changed:
const updateFromA = Y.encodeStateAsUpdate(docA);
const updateFromB = Y.encodeStateAsUpdate(docB);
Y.applyUpdate(docB, updateFromA);
Y.applyUpdate(docA, updateFromB);

console.log('A ends with:', docA.getArray('list').toArray());
console.log('B ends with:', docB.getArray('list').toArray());
```
Run it:
```bash
node crdt-demo.js
```
**Checkpoint:** both the last two lines should print the same four items — nothing lost, and you didn't write a single line of merge logic. That's the whole reason Flux uses this.

### Step 2: Understand how user clicks turn into notebook edits

When someone clicks a button in the UI, we describe *what changed* using a simple, standard format called **JSON Patch** — basically a tiny instruction like `{"op": "replace", "path": "/title", "value": "New title"}`.

Here's the important, slightly tricky idea from TRD.md: JSON Patch is just how we *describe* a change on the wire — it is **not** what resolves conflicts. Yjs (the CRDT) is what actually resolves conflicts. So the flow is:

1. Browser makes a JSON Patch instruction describing the click.
2. That instruction gets translated into the matching Yjs operation (e.g., `path: /title` becomes `map.set('title', ...)`).
3. Yjs applies it and — if there's a conflicting edit from someone else — Yjs resolves it automatically, the same way your demo above resolved "bread" vs. "bananas."

You don't need to build this translation layer yet — just understand *why* it exists: JSON Patch is the messenger, Yjs is the peacekeeper.

**What "done" looks like for this phase:** you can explain, in your own words, why we don't just apply JSON Patch directly and skip Yjs (hint: JSON Patch alone has no idea what to do if two edits happen at once).

---

## Part 7 — Phase 3: Paintbrush, Pause Button, and Adapters

### 7a. The Paintbrush (Renderer)

**The problem, made concrete:** an AI writes its answer one word at a time. Imagine it's in the middle of streaming this:
```
{"component": "Card", "title": "Hello, I am st
```
If you try `JSON.parse()` on that right now, it throws an error — the text isn't finished yet. But we don't want to wait for the *entire* response before showing anything on screen.

**The fix:** try to parse it as-is; if that fails, try to guess how to "close it up" (finish the open quote, close any open brackets), parse the closed-up version, and show *that* — then repeat as more text arrives.

Try it yourself. Save as `parser-demo.js`:
```js
function tryRepairJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // not complete yet — try to fix it below
  }

  let repaired = text;

  // If we're in the middle of a string, close the quote
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) repaired += '"';

  // Track open brackets in order, using a "stack"
  const stack = [];
  for (const char of repaired) {
    if (char === '{' || char === '[') stack.push(char);
    if (char === '}' || char === ']') stack.pop();
  }
  // Close them in reverse order (last opened, first closed)
  while (stack.length > 0) {
    repaired += stack.pop() === '{' ? '}' : ']';
  }

  try {
    return JSON.parse(repaired);
  } catch (e) {
    return null; // still broken — wait for more text
  }
}

console.log(tryRepairJSON('{"title": "Hello, I am st'));
```
Run it:
```bash
node parser-demo.js
```
**Checkpoint:** you should see `{ title: 'Hello, I am st' }` printed — a usable object, even though the original text was cut off mid-word. (This is a simplified teaching version — the real one in TRD §4.3 also validates against the component's schema before trusting the result.)

**A word on safety:** once you can turn AI text into an object, the tempting next step is to drop any string prop straight onto the page. Don't. Before any AI-written text can become HTML, it must pass through a sanitizer — otherwise a malicious or hallucinated string like `<img src=x onerror="steal_data()">` could run code on your page. Try it:
```bash
npm install dompurify jsdom
```
```js
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const DOMPurify = createDOMPurify(new JSDOM('').window);

const dangerous = '<img src=x onerror="alert(1)">Hello';
console.log(DOMPurify.sanitize(dangerous));
// -> "Hello" — the dangerous part is gone
```
This is non-negotiable in Flux — see RULES.md rule #2. Every adapter must call this before rendering AI-written rich text, no exceptions.

### 7b. The Pause Button (HITL)

**The problem, made concrete:** imagine the AI decides to delete a customer's account. You want a real human to click "yes, really do this" *before* it happens — and you want that "yes" to be unforgeable (nobody should be able to fake it) and single-use (nobody should be able to replay an old "yes" to approve something new).

We do this with a **signed token** — think of it like a wristband at a concert: it proves you were let in, it's hard to fake, and it only works once.

Try a simplified version. Save as `token-demo.js`:
```js
const crypto = require('crypto');
const SESSION_SECRET = 'keep-this-only-on-the-server'; // never send this to the browser

function createApprovalToken(actionId, sessionId) {
  const nonce = crypto.randomBytes(8).toString('hex'); // one-time random code
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 120_000; // valid for 2 minutes

  const message = `${actionId}.${sessionId}.${nonce}.${issuedAt}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(message).digest('hex');

  return { actionId, sessionId, nonce, issuedAt, expiresAt, sig };
}

function verifyToken(token) {
  const message = `${token.actionId}.${token.sessionId}.${token.nonce}.${token.issuedAt}.${token.expiresAt}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(message).digest('hex');
  if (token.sig !== expectedSig) return false;
  if (Date.now() > token.expiresAt) return false;
  return true;
}

const token = createApprovalToken('delete-account-42', 'session-1');
console.log('Valid?', verifyToken(token)); // true
token.sig = 'tampered';
console.log('Tampered, still valid?', verifyToken(token)); // false
```
**Checkpoint:** the first check prints `true`, the second prints `false` — proving a tampered token gets caught. (A real system also needs to remember which nonces have already been used, so a *valid, unmodified* token can't be replayed twice — that piece is a small database lookup, left out here for simplicity.)

Now the "pause" part — the piece that actually stops the AI from continuing:
```js
const pendingApprovals = {};

function pauseForApproval(actionId) {
  return new Promise((resolve) => {
    pendingApprovals[actionId] = resolve;
    // in the real app, this is also where you'd send an
    // "approval.request" message to the browser over WebSocket
  });
}

function onApprovalTokenReceived(token) {
  if (verifyToken(token) && pendingApprovals[token.actionId]) {
    pendingApprovals[token.actionId](true); // this "un-pauses" the waiting code
    delete pendingApprovals[token.actionId];
  }
}
```
The key idea: `pauseForApproval` returns a Promise that simply never resolves until `onApprovalTokenReceived` is called with a valid, matching token. Whatever code called `await pauseForApproval(...)` is genuinely frozen until then — not just hidden behind a loading spinner.

### 7c. Adapters (one example, in Vue)

**The idea, explained simply:** think of a power plug adapter — the electricity (our core logic) is the same everywhere, but the plug shape (how Vue, Svelte, or Solid *want* to receive updates) is different in each country. An "adapter" is a small wrapper that lets the same core logic plug into any of them.

Here's what a Vue adapter looks like, conceptually (assuming a `FluxTransport` class already exists from Phase 1):
```js
// use-flux-agent.js
import { ref, onMounted, onUnmounted } from 'vue';

export function useFluxAgent(url) {
  const messages = ref([]);
  let transport;

  onMounted(() => {
    transport = new FluxTransport(url);
    transport.on('text.delta', (chunk) => {
      messages.value.push(chunk);
    });
    transport.connect();
  });

  onUnmounted(() => transport?.close());

  return { messages };
}
```
Notice this file contains almost no "real" logic — it just connects Vue's reactivity (`ref`) to events coming out of the core transport. That's the whole point of an adapter: thin, and easy to trust, because all the hard logic lives in one shared place (`@flux/core`).

**What "done" looks like for this phase:** you can explain, out loud, what problem each of the three pieces above solves, and you've run all three demo scripts successfully.

---

## Part 8 — Phase 4: Package It Up

Once the four building blocks work, the last stretch is making Flux easy for *other* people to start using.

### A tiny scaffolding CLI

This is the idea behind `npm create flux@latest` — a script that copies a ready-made template folder into a new project so a developer doesn't start from a blank file:
```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectName = process.argv[2] || 'my-flux-app';
const templateDir = path.join(__dirname, 'templates', 'vue');

fs.cpSync(templateDir, projectName, { recursive: true });
console.log(`Created ${projectName}! Now run:\n  cd ${projectName}\n  npm install\n  npm run dev`);
```

### The docs checklist

- `README.md` — what Flux is, and the fastest possible "hello world."
- `CONTRIBUTING.md` — how someone else can help build it.
- A small playground page where people can try Flux live in the browser.

---

## Part 9 — Phase 5: After Launch

Briefly: once v1 is out, the remaining work is about strengthening what already exists rather than building new pieces — responding to security reports, considering a stronger version of the approval-token system (real per-device keys instead of shared server secrets), and possibly a React adapter if there's real demand for it. See PHASES.md's Phase 5 for the full list.

---

## Part 10 — When Something Goes Wrong

| Symptom | Likely cause |
|---|---|
| `EventSource` never fires `onmessage` | Check the server response has *both* `\n` after `data:` and an *extra* blank `\n\n` at the very end of each message — SSE is picky about this. |
| WebSocket won't connect | Make sure you used `ws://` (not `http://`) in the browser, and that the port matches your server. |
| `node crdt-demo.js` shows different lists on A and B | Make sure you called `Y.applyUpdate` on *both* sides after swapping updates — merging is not automatic until you actually hand each side the other's update. |
| `DOMPurify.sanitize` throws an error about `window` | You forgot to pass a `window` into `createDOMPurify(...)` — it needs one even in Node.js, which is what `jsdom` provides. |
| `verifyToken` always returns `false`, even untampered | Double-check you're building the exact same `message` string, in the exact same order, on both the signing and verifying side — HMAC signatures are extremely sensitive to any difference, even whitespace. |

---

## Part 11 — Cheat Sheet: Plain Words → Official Names

Once you're ready to read TRD.md and ARCHITECTURE.md, here's the bridge:

| What we called it here | Official name |
|---|---|
| The Messenger | Transport Layer / `FluxTransport` |
| The labeled box | `FluxEnvelope` |
| The Shared Notebook | State Engine / `FluxStore` |
| The bridge from clicks to notebook edits | `PatchBridge` |
| The Paintbrush | Generative UI Renderer / `StreamingUIParser` |
| The bouncer for AI text | `sanitize()` |
| The Pause Button | HITL / `agent.pauseForApproval()` |
| The wristband | `ApprovalToken` |
| The power plug adapter | Framework Adapter (`@flux/vue`, `@flux/svelte`, `@flux/solid`) |

---

## Part 12 — What to Read Next

- **GUIDE.md** *(not yet created — say the word if you want it)* will go deeper into each concept above (CRDTs, streaming parsers, security) as a proper multi-week learning curriculum, for when you want more than this walkthrough.
- **TRD.md** has the exact, production-grade version of everything simplified here.
- **RULES.md** has the hard boundaries to respect once you start writing real code, not just experiments.
- **PHASES.md** has the week-by-week plan this guide's phases are based on.
