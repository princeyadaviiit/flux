# Security Policy & Invariants

The Flux team takes the security of agentic AI web applications extremely seriously. Because Flux brokers autonomous agent execution, generative UI rendering, and shared state, it enforces strict cryptographic and architectural invariants.

---

## 🔒 Non-Negotiable Security Invariants

All core subsystems and framework adapters strictly enforce the following security invariants:

1. **Mandatory XSS Sanitization (RULES.md §1.2):**
   - All LLM-authored strings rendered in rich-text UI props must route through `sanitize()` before DOM injection.
   - Powered by isomorphic DOMPurify to neutralize `<script>`, `<iframe>`, inline event handlers (`onerror`, `onload`, `onclick`), and `javascript:` pseudo-protocols.

2. **Immediate Nonce Invalidation (RULES.md §1.4):**
   - Approval token nonces are single-use and are **burned immediately on every verification attempt**, regardless of whether signature verification succeeds or fails.
   - This prevents token replay attacks, timing oracle attacks, and race conditions.

3. **Cryptographic Integrity & Gated Execution (RULES.md §1.3):**
   - All approval requests for side-effecting operations require HMAC-SHA256 (v1) or ECDSA P-256 / WebCrypto (v2) signatures with strict TTL expiration.
   - `AgentHITL.pauseForApproval()` provably halts async execution on the server until valid approval is received.

4. **Network Boundary Isolation (RULES.md §1.1):**
   - Only RFC 6902 JSON Patch operations are transmitted over the wire. Raw internal CRDT binary representations are never exposed directly to untrusted network clients.

---

## 🛡️ Supported Versions

| Version | Supported |
|---|---|
| `1.x` | ✅ Yes |
| `< 1.0` | ❌ No |

---

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability within Flux, please **do not open a public GitHub issue**.

Please report security vulnerabilities directly via email to:
**`security@flux-agentic.org`** (or open a private GitHub Security Advisory).

### What to Include in Your Report:
- Detailed description of the vulnerability and its potential impact.
- Step-by-step reproduction steps or proof-of-concept code.
- Impacted packages (`@flux/core`, `@flux/react`, `@flux/vue`, `@flux/svelte`, `@flux/solid`, `@flux/cli`).
- Proposed mitigations or fixes (if any).

### Disclosure Timeline:
- **Acknowledgement:** Within 24 hours of receipt.
- **Triage & Assessment:** Within 48 hours.
- **Fix & Advisory Release:** Within 7 business days for critical vulnerabilities.

Thank you for helping keep Flux and the Agentic AI ecosystem secure!
