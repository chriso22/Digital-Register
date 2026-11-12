# Digital Register

A mobile-friendly digital check register that runs entirely in the browser.

**Columns:** No./Code · Date · Transaction description · Payment / fee / withdrawal · Deposit · Balance (running)

Enter a **beginning balance**, add rows, and the balance column updates from prior amounts. Data is stored in `localStorage` and mirrored into the URL hash so you can bookmark or share a register link—handy on iPhone Safari.

**Backup:** **Download backup** encrypts the register with a password (AES-GCM via Web Crypto) before saving a JSON file; **Restore backup** decrypts with that password. Older unencrypted backups still restore.

**PIN (optional):** **Set PIN** adds a local lock screen on this device. It is a casual access barrier stored only in the browser—not server-side authentication.

**Sub-registers (budgets):** **New budget** sets money aside for a purpose and posts a payment on the main register. **Spend** draws down that envelope without another main-register payment (the cash was already earmarked). **Clear** removes the sub-register; any unused leftover is deposited back. **Add** tops up an existing budget.

## Run locally

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

Or open `index.html` directly in a browser.

## Share on iPhone / GitHub Pages

1. Push to GitHub → **Settings** → **Pages**
2. Source: Deploy from a branch → Branch: `main` (or this PR’s branch after merge) → Folder: `/ (root)` → Save
3. Site URL (for this repo): `https://chriso22.github.io/Digital-Register/`
4. On iPhone: open the site, fill the register, tap **Copy share link**, then paste into Messages/Notes. Recipients open the same balance and entries.

`.nojekyll` is included so Pages serves files as-is.

## App updates

Installed copies check for a new version when they open and when you switch back to them. If one is waiting, a banner says **New version available. Tap to update**. The version code is at the bottom of the register and on the PIN screen.

That version is a short hash of the page, manifest, icons, and service worker. It is written in one place by:

```bash
node scripts/stamp-pwa-version.mjs
```

CI fails if the page changed and this stamp was not run. GitHub Pages serves the files as they are committed, so the stamp has to be in the commit.

Saved registers stay in this browser (`localStorage` and the page link). An update reloads the app shell only. It does not clear or migrate entries, the PIN, or backups.

The Home Screen icon created before this updater existed still has no way to notice a new version. Remove that icon and add the site once more. After that, use the banner.

## License

MIT — see [LICENSE](LICENSE).
