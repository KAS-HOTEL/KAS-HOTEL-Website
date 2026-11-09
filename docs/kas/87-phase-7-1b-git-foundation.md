# 87 — Phase 7.1b: Git Foundation & Project Safety

**Phase:** 7.1b — Git Foundation & Project Safety
**Status:** Repository initialised and staged. **Initial commit BLOCKED — git identity not configured.**
**Executed:** 2026-08-14
**Last updated:** 2026-08-14

---

## 1. Git initialisation

| Action | Result |
|---|---|
| Pre-flight check | `fatal: not a git repository` — confirmed clean greenfield |
| `git init -b main` | ✔ `Initialized empty Git repository in C:/Kas-Web/.git/` |
| Default branch | **`main`** — set at creation, not renamed afterwards |
| Files present before init | 67 markdown, 0 other |
| Files deleted or modified by init | **None** |

### 1.1 Repository-local settings applied

**Repo-scoped only.** No global or system git configuration was touched.

| Setting | Value | Rationale |
|---|---|---|
| `core.autocrlf` | `false` | `.gitattributes` is the single authority on line endings. Leaving autocrlf active would give two competing mechanisms |
| `core.longpaths` | `true` | Windows 260-character path limit breaks on deep `node_modules` trees. Set now, before it bites in Phase 7.5 |
| `core.ignorecase` | `false` | Windows is case-insensitive; Linux CI is not. Forces the local repo to behave like CI, so a case-only rename cannot silently pass locally and fail in the pipeline |
| `pull.ff` | `only` | Prevents accidental merge commits on pull |

---

## 2. Git identity status

```
user.name   <UNSET>     local · global · system — all empty
user.email  <UNSET>     local · global · system — all empty
```

> ## ⚠ GIT_IDENTITY_REQUIRED
>
> **No identity was invented.** Phase 7.1b explicitly prohibits a fabricated identity, and the initial
> commit is gated on this. All work is staged and verified; **only the commit is outstanding.**

### 2.1 Commands for the project owner

Global — applies to every repository on this machine:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Or repository-local — applies to `C:\Kas-Web` only:

```bash
git -C C:/Kas-Web config user.name "Your Name"
git -C C:/Kas-Web config user.email "you@example.com"
```

**PROPOSED** — Repository-local is the safer default if this machine hosts other projects: it cannot
alter attribution on unrelated repositories.

**Note:** the email associated with this session is `bookingofagoda@gmail.com`. It has **not** been
used — it is a Claude account address, not a stated git identity. **The choice is the owner's.**

### 2.2 Then commit

```bash
cd C:/Kas-Web
git commit -m "docs: establish KAS product foundation"
```

Everything is already staged. No `git add` is required.

---

## 3. `.gitignore`

Created at `C:\Kas-Web\.gitignore`, organised in ten sections.

### 3.1 Protected

| Category | Coverage |
|---|---|
| **Secrets** | `.env`, `.env.*`, `*.env`, `secrets/`, `credentials*`, `*secret*.json` |
| **Keys and certificates** | `.pem` `.key` `.p12` `.pfx` `.jks` `.keystore` `.asc` `.gpg` `id_rsa` `id_ed25519` `.ppk` |
| **Cloud credentials** | `.aws/` `.gcp/` `service-account*.json` `application-local.*` `application-secrets.*` |
| **Node** | `node_modules/` `.next/` `out/` `dist/` `.turbo/` `.vercel/` `*.tsbuildinfo` |
| **Java** | `target/` `*.class` `*.war` `.gradle/` `hs_err_pid*` |
| **Local database artefacts** | `*.sqlite` `*.db` `pgdata/` `*.dump` `*.backup` |
| **Tests and coverage** | `coverage/` `test-results/` `playwright-report/` `jacoco.exec` `surefire-reports/` |
| **Logs and temp** | `*.log` `logs/` `*.tmp` `*.bak` `*~` `.cache/` |
| **IDE** | `.idea/` `*.iml` `.vscode/` `.settings/` `.classpath` |
| **OS** | `.DS_Store` `Thumbs.db` `Desktop.ini` `$RECYCLE.BIN/` |
| **Docker local** | `docker-compose.override.yml` `docker-compose.local.yml` `.docker/data/` |
| **Runtime media** | `uploads/` `storage/` `public/uploads/` |

### 3.2 Explicitly kept tracked

Documentation · source code · **`db/migrations/**`** and `db/seed/**` · `package.json` ·
`package-lock.json` · `tsconfig.json` · `pom.xml` · **`mvnw` · `mvnw.cmd` · `.mvn/wrapper/*`** ·
Gradle wrapper if later adopted · `ops/docker-compose.yml` · `Dockerfile` · `.github/workflows/**` ·
**`.env.example`** and `.env.template`.

### 3.3 A real bug found and fixed during verification

**Finding.** Four `.gitignore` pattern lines carried **trailing comments**:

```
!.env.example                 # template: names + placeholders only
docker-compose.override.yml   # local-only overrides may hold credentials
!.mvn/wrapper/maven-wrapper.jar     # Maven wrapper MUST be committed
!gradle/wrapper/gradle-wrapper.jar  # Gradle wrapper MUST be committed
```

**Git `.gitignore` does not support trailing comments.** A `#` only begins a comment at the *start* of
a line. Each pattern above was therefore read literally — including the comment text — and matched
nothing.

**Consequences before the fix:**

| Pattern | Intended | Actual |
|---|---|---|
| `!.env.example` | Tracked | ❌ **Ignored** — the template would never have been committed |
| `docker-compose.override.yml` | Ignored | ❌ **Tracked** — a likely credential holder would have been committable |

**Detected by** the dry-run assertion suite in §5.3, which tests `git check-ignore` against
representative paths **before** any file exists. **Fixed** by moving every comment to its own line and
re-verifying. All 32 assertions now pass.

**PROPOSED** — This is why the dry-run suite exists. A `.gitignore` that *looks* correct in review can
be silently wrong; only asserting its behaviour catches it.

---

## 4. `.gitattributes`

Created at `C:\Kas-Web\.gitattributes`.

### 4.1 Strategy

```
* text=auto eol=lf
```

Everything normalises to **LF in the repository** and checks out **LF on every platform**, with two
deliberate exceptions. The project is developed on Windows and built on Linux; a mixed repository
produces phantom whole-file diffs and broken shell scripts.

### 4.2 Rules

| Class | Handling |
|---|---|
| Documentation | `*.md` `*.txt` `*.adoc` → `text eol=lf`, `diff=markdown` |
| Java / Spring | `*.java` `*.kt` `*.xml` `*.properties` `*.gradle` `pom.xml` → `text eol=lf` |
| TypeScript / frontend | `*.ts` `*.tsx` `*.js` `*.css` `*.scss` `*.html` `*.svg` → `text eol=lf` |
| Data / config | `*.json` `*.yml` `*.yaml` `*.toml` `.editorconfig` → `text eol=lf` |
| SQL | `*.sql` → `text eol=lf` — migrations are source code |
| **Shell — LF mandatory** | `*.sh` `mvnw` `gradlew` `Dockerfile` `Makefile` → `text eol=lf`. **CRLF here breaks execution on Linux and in CI** |
| **Windows — CRLF mandatory** | `*.bat` `*.cmd` `*.ps1` `mvnw.cmd` `gradlew.bat` → `text eol=crlf`. **LF here breaks `cmd.exe` parsing** |
| Binary | `*.jar` `*.zip` `*.pdf`, all image formats, all font formats, all media → `binary` |
| Statistics | `docs/**` → `linguist-documentation`, so 1.4 MB of markdown does not dominate language stats |
| Archives | `.gitattributes` `.gitignore` `.github/` → `export-ignore` |

**Encoding:** UTF-8 without BOM throughout. `working-tree-encoding` is deliberately **not** used — it
causes more problems than it solves, and every tool in this stack defaults to UTF-8.

---

## 5. Security and safety checks

All checks were run against the **staged** content.

### 5.1 Results

| # | Check | Result |
|---|---|---|
| 1 | `git diff --cached --check` — whitespace, conflict markers | ✔ **PASS** *(after the fix in §5.2)* |
| 2 | Staged file inventory | ✔ 69 files: 67 markdown + `.gitignore` + `.gitattributes` |
| 3 | Secret-shaped filenames staged | ✔ **PASS** — none |
| 4 | Binary files staged | ✔ **PASS** — zero |
| 5 | Generated artefacts staged | ✔ **PASS** — no `node_modules/`, `target/`, `.next/`, `dist/`, logs or database files |
| 6 | Untracked files remaining | ✔ 0 |
| 7 | `.gitignore` dry-run assertions | ✔ **32/32** (§5.3) |
| 8 | Inline-comment bug class | ✔ **PASS** — re-scan clean |

### 5.2 Whitespace finding

`git diff --cached --check` flagged one trailing space:

```
docs/kas/67-phase-5-property-room-experience.md:278: trailing whitespace.
```

A trailing space at the end of a markdown table row, in content authored during Phase 5. **Corrected**
— the space was removed; no other change to the line, the table, or the document's meaning. Re-run
passes.

### 5.3 `.gitignore` dry-run assertions

Executed with `git check-ignore` against paths that **do not yet exist**, so behaviour is verified
before Phases 7.2–7.5 create them. **No file was created.**

**Must be ignored — 16/16 ✔**
`.env` · `.env.local` · `.env.production` · `secrets.json` · `server.pem` · `app.key` ·
`backend/target/app.jar` · `frontend/node_modules/x/i.js` · `frontend/.next/b.js` · `app.log` ·
`local.sqlite` · `coverage/lcov.info` · `docker-compose.override.yml` · `.idea/workspace.xml` ·
`.DS_Store` · `uploads/hero.jpg`

**Must be tracked — 16/16 ✔**
`.env.example` · `.env.template` · `backend/pom.xml` · `backend/mvnw` · `backend/mvnw.cmd` ·
`backend/.mvn/wrapper/maven-wrapper.jar` · `backend/.mvn/wrapper/maven-wrapper.properties` ·
`db/migrations/V1__init.sql` · `db/seed/properties.sql` · `ops/docker-compose.yml` · `ops/Dockerfile` ·
`.github/workflows/ci.yml` · `frontend/package.json` · `frontend/package-lock.json` ·
`frontend/tsconfig.json` · `docs/kas/00-README.md`

---

## 6. Initial commit

> ## ⚠ NOT CREATED — blocked on §2

| Property | Value |
|---|---|
| **Commit hash** | **none — no commit exists** |
| Commits in repository | **0** |
| Branch | `main` |
| Staged and ready | **69 files** |
| Blocking condition | `user.name` and `user.email` unset |
| Prepared message | `docs: establish KAS product foundation` |

Phase 7.1b Step 6 gates the commit on identity being configured. It is not. **The identity was not
invented, and the commit was not forced.** Everything else is complete; the commit is a single command
once §2.1 is run.

**Contents when committed:** 67 approved documentation files · `.gitignore` · `.gitattributes`.
**Excluded:** no `.env`, no credentials, no secrets, no generated files, no database files, no
`node_modules`, no build output — verified in §5.

---

## 7. Remote status

> ## ⚠ REMOTE_REQUIRED

| Property | Value |
|---|---|
| Remotes configured | **0** |
| Push status | **Not applicable — nothing to push, no remote** |
| Force push performed | **No** — and never will be |
| History rewritten | **No** |

**PROPOSED — recommendation: a PRIVATE repository.** The corpus contains commercial strategy, pricing
architecture, sales workflow and unreleased brand positioning. It must not be public.

**No URL has been invented.** Once the owner provides one:

```bash
cd C:/Kas-Web
git remote add origin <URL-PROVIDED-BY-OWNER>
git push -u origin main
```

**Not requested and never will be:** GitHub passwords, personal access tokens, SSH private keys or any
other credential. Authentication is configured by the owner through their own credential helper.

**Not executed without explicit authorisation:** `git push`. Step 8 requires it, and no remote exists.

---

## 8. Repository safety rules

**PROPOSED** — Standing rules for every subsequent phase.

| # | Rule |
|---|---|
| 1 | **Never `git push --force`** on a shared branch |
| 2 | **Never `git reset --hard`** without an explicit, informed instruction |
| 3 | **Never rewrite published history** — no `rebase` or `filter-branch` on pushed commits |
| 4 | **Never commit a real secret.** If one is committed, treat it as compromised: rotate it, then purge |
| 5 | **`.env` files are never tracked.** Only `.env.example` with placeholders |
| 6 | **`docs/kas/**` is never modified by implementation work** — it is the approved record |
| 7 | Verify `git status` before every commit; commit deliberately, never `git add -A` blindly once source exists |
| 8 | Feature branches off `main`; `main` stays releasable |
| 9 | Secret scanning in CI from the first workflow |
| 10 | Re-run the §5.3 dry-run assertions whenever `.gitignore` changes |

---

## 9. Success criteria

| # | Criterion | Status |
|---|---|:--:|
| 1 | Git repository exists | ✔ `main`, `C:/Kas-Web/.git/` |
| 2 | Documentation is version controlled | ⚠ **Staged, not committed** — blocked on identity |
| 3 | `.gitignore` exists | ✔ Verified by 32 dry-run assertions |
| 4 | `.gitattributes` exists | ✔ |
| 5 | No secrets tracked | ✔ Zero secret-shaped files staged |
| 6 | No generated artefacts tracked | ✔ Zero binary, zero build output |
| 7 | `git diff --check` passes | ✔ **PASS** after the §5.2 fix |
| 8 | Initial commit exists | ❌ **BLOCKED — GIT_IDENTITY_REQUIRED** |
| 9 | Remote status explicitly known | ✔ **REMOTE_REQUIRED** — none configured |
| 10 | No destructive git operation performed | ✔ No force push, no reset, no branch deletion, no history rewrite |

**9 of 10 pass. Criterion 2 and 8 are blocked by a single decision that only the owner can make.**

---

## 10. Next step

**Two owner actions, then Phase 7.2.**

1. **Configure git identity** (§2.1) — one command.
2. **Commit** — `git commit -m "docs: establish KAS product foundation"`. Everything is staged.
3. *(Recommended, not blocking)* **Provide a private remote URL** (§7), then `git push -u origin main`.
   This resolves risk **R1** from [86](86-phase-7-1-environment-bootstrap.md) — six phases of approved
   architecture currently have **no off-machine backup**.

**Then: Phase 7.2 — Database Foundation.**

Phase 7.2 needs nothing that is not already installed: PostgreSQL 17 is running natively, and psql
17.10 is on PATH. JDK 21 (risk R2) is not required until Phase 7.3.

**Do not start Phase 7.2 until the commit exists.** Writing migrations against an uncommitted
repository re-creates the exact risk this phase was created to eliminate.
