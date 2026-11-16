# Forking URBAN ASSIST — reference model

**Reference repository:** https://github.com/bruscilorenzo-GHcode/urban-assist
**Live reference deployment:** https://urban-assist-982.netlify.app
**Reference version:** see the latest tag (`git tag -l 'v*' | sort -V | tail -1`); current: **v1.0.0**

*(Italiano in breve: questo repo è la **versione reference**. I fork devono restare
allineati a `main`/tag upstream e mettere le proprie personalizzazioni in
pack/dati, non nel core; procedura di sync sotto.)*

## 1 · What "reference" means

`main` is always **green** (CI: `npm test` + `npm run build`) and is the only
source of truth. The live site is deployed from it. Tags mark releasable
baselines; researchers should fork **a tag**, not a random commit.

## 2 · Fork and keep the upstream link

```bash
# once — fork on GitHub, then:
git clone https://github.com/<you>/urban-assist.git
cd urban-assist
git remote add upstream https://github.com/bruscilorenzo-GHcode/urban-assist.git
git fetch upstream --tags

# every time you want the updated reference:
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main
npm ci && npm test && npm run build
```

Rule: **never edit `main` directly in your fork**. Keep your work on a branch and
rebase it onto `upstream/main`; when a change is generally useful, open a PR to
the reference repo instead of diverging.

## 3 · Where you customize (no code)

Everything a territory needs is **data/config**, so forks do not have to touch
the core:

| Need | Where | Deploy needed? |
| :--- | :--- | :--- |
| New city / Dramaturgical Zone | pilot mode in the app (`?pm=1` for packs) or a curated zone in `src/assist-urban/pipeline/dramaturgical-zones.ts` | only for curated zones |
| Themes, event calendar, copy, fabric palette/opacity/curvature | **Project pack JSON** (`?pm=1` → export/import) and event templates with `source` + `confidence` | no |
| Stories, media, pilot zones | Netlify Blobs of **your own** site | no |
| Core behaviour (state model, fabric mechanics, APIs) | upstream repo — propose a PR | — |

**Forbidden without upstream agreement:** changing `src/core/state/*` semantics,
the non-destructive relevance rule, template-only explanations, the fabric being
additive, the privacy invariants (consent → PII scrub → anonymous cell).

## 4 · Deploy your fork

Each fork gets **its own Netlify site and its own Blobs** (data is site-scoped —
a fork never sees the reference data, and the reference never sees yours):

```bash
npm ci
npx netlify-cli sites:create --name <your-app-name> --account-slug <your-team>
npx netlify-cli link --name <your-app-name>
npx netlify-cli deploy --prod --build
```

Optional env: `GROQ_API_KEY` (voice transcription only). No database to
provision; Netlify Blobs is the store. If the site comes up protected (SSO),
turn protection off for public pilots.

## 5 · Data you may want to bring along

Blobs are per site. To copy a store between sites (stories, media, zones,
cities) use `@netlify/blobs` with `siteID` + a personal access token, e.g.:

```js
getStore({ name: 'assist-urban-stories', siteID: SRC, token })
// list() → get(key, { type: 'arrayBuffer' }) → otherSite.set(key, data, { metadata })
```

Copy media **with metadata** (`{ contentType, size }`), otherwise images render
as `application/octet-stream`.

## 6 · Release discipline

- `main` protected; PRs only; CI must pass.
- Tag the reference (`vX.Y.Z`) and note user-visible changes in `CHANGELOG.md`.
- Deploy production only from a tagged `main`.
- Keep forks' `pack`/`events`/`copy` in versioned JSON so a pack can be moved
  between territories in a minute.

## 7 · Decisions that belong to the owner

- Repository visibility (a fork requires access: public repo or team invites).
- Who curates annual event instances (PM, curator, external service).
- Whether text search should include audio transcripts.
- Whether national events outside the territory belong in the calendar.
- PM overrides: browser-local only, or persisted server-side.
