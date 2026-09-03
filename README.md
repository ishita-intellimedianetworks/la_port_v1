This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Three models, one zone, one config file each

`/`, `/v2` and `/v3` each run a different bake, and each reads a COMPLETE config
of its own:

| route | config | bake |
|---|---|---|
| `/` | `src/config/sites/v1.json` | `portla-c5-v5-obj` — object chunks, instancing off, static ocean |
| `/v2` | `src/config/sites/v2.json` | `portla-c5-v6wo-inst-mo` — instanced, animated water, resident geometry |
| `/v3` | `src/config/sites/v3.json` | `NEXT_PUBLIC_STREAM_BASE_V3` (today `v8w-inst-mo`) |

Nothing is inherited or merged between them. Each file carries its own cameras,
hotspots, layouts, map, sky and `stream` block, so a retune for one route cannot
move another — and a change meant for every model has to be made three times, on
purpose. `src/config/index.ts` resolves all three; a route names one with
`<SiteProvider id="v2">` and everything below reads `useSite()`.

## Two views, one zone

| view | model | why |
|---|---|---|
| **Dollhouse** | `assets.modelUrl` — one decimated GLB | A fixed vantage frames the whole zone, so the frustum cull buys nothing and the streaming bands only fight the byte ceiling. A single-draw-call mesh is simply the right answer up there. |
| **First person** | the chunk set in `stream` | Walking sees a small radius at a time, which is exactly what streaming is for. |

The walking model is cut into distance-tiered chunks plus a shared instance
palette, and `src/streaming/` decides at runtime which chunk is loaded at which
quality — or whether it is loaded at all:

    near = good · mid = medium · far = low · beyond far = not loaded

Double-clicking the dollhouse flies the camera down to `cameras.spawn`, raises a
blackout over the last of the fly-in, swaps the GLB out for the streamer behind
it, and holds the black until the zone has filled in around the landing point.

Chunk files live under `public/assets/<slug>/assets/` and are **gitignored** —
~100 MB per model, all regenerable. A fresh clone still shows the dollhouse, but
walks into an empty zone, until they are staged. Two ways to get them:

```bash
# a) point at a hosted copy (nothing to stage locally)
echo 'NEXT_PUBLIC_ASSET_BASE=https://<your-bucket>/assets' > .env.local

# b) re-bake from the source GLB, in the LA_PORT_ADAPTIVE repo, and copy
#    public/assets/<slug>/assets/ over
npm run bake <slug>
```

The slug and every tuning number are in that model's `<site>.json › stream`.
`tiers.*.distance`,
`tiers.*.texture`, `streaming.*`, `cache.*`, `fog` and `aerial` are read live by
the browser — edit and reload. The geometry LODs, the texture rungs and the
chunking itself are baked into the files and need a re-bake.

`public/draco/` and `public/basis/` are the Draco and KTX2/Basis decoders the
chunk loader needs; they are committed.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
