@AGENTS.md

# The v4 Port Security layer

`docs/security_demo.md` describes how `/v4` works and why: the fork from v3, the
Security Mode rules, where the S01-S08 data lives, and the decisions behind
each. Read it before changing anything under `src/terminal-v4/`,
`src/config/sites/v4.json`, or the security store.

**Keep it updated in the same change.** Any edit that alters v4's behaviour
(a new security hotspot, a store field or action, a Security Mode rule, a config
key, a change to what the mode hides or disables) updates
`docs/security_demo.md` too. It is the only prose record of how v4 differs from
v3, and a stale one is worse than none. Its "Not built yet" section is the
running list of what remains; move items out of it as they land.

## Verifying v4

Do NOT run `next dev` or `next build`. A dev server is kept running locally and
a build overwrites its `.next/`. Verify with:

```bash
npx tsc --noEmit                       # must be clean
npx eslint src/terminal-v4             # must match src/terminal-v3 exactly
```

v3 and v4 carry the same inherited lint problems, so any difference in the
counts is something the change introduced. `next lint` is removed in Next 16, so
call `eslint` directly.
