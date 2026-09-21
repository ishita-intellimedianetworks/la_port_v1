@AGENTS.md

# The v5 Port Security layer

`docs/security_demo.md` describes how `/v5` works and why: the fork from v3 that
became v4, the fork from v4 that became v5, the Security Mode rules, where the
S01-S08 data lives, and the decisions behind each. Read it before changing
anything under `src/terminal-v5/`, `src/config/sites/v5.json`, or the security
store.

**`/v4` is the stable demo, and it is v5 with the new anchors gated off.** The
two trees are the same code - they differ only in `index.tsx` and four
`@/terminal-vN/stores/sky-store` self-imports. The difference that matters is
in the site file: `v4.json` carries `enabled: false` on S03-S08 and no
`worldModels`, so v4 shows S01 and S02 over a terminal with no craft in the
water, while v5 shows six.

**New work goes in v5.** Port a fix back to v4 only when asked, and when you do,
keep `enabled` and `worldModels` as they are - those two keys are the whole of
what makes v4 the stable one.

**Keep the doc updated in the same change.** Any edit that alters v5's behaviour
(a new security hotspot, a store field or action, a Security Mode rule, a config
key, a change to what the mode hides or disables) updates
`docs/security_demo.md` too. It is the only prose record of how v5 differs from
v3, and a stale one is worse than none. Its "Not built yet" section is the
running list of what remains; move items out of it as they land.

## Verifying v5

Do NOT run `next dev` or `next build`. A dev server is kept running locally and
a build overwrites its `.next/`. Verify with:

```bash
npx tsc --noEmit                       # must be clean
npx eslint src/terminal-v5             # must match src/terminal-v3 exactly
```

v3, v4 and v5 carry the same inherited lint problems, so any difference in the
counts is something the change introduced. `next lint` is removed in Next 16, so
call `eslint` directly.
