# Wiki source

Markdown source for the GitHub Wiki. GitHub wikis are a separate git repo, so these files must be copied there to appear on the Wiki tab.

```bash
# One-time: create the first page in the Wiki tab on GitHub so the wiki repo exists.
git clone https://github.com/sunflynf/short-video-streaming-app.wiki.git /tmp/wiki
cp wiki/*.md /tmp/wiki/ && rm /tmp/wiki/README.md
cd /tmp/wiki && git add -A && git commit -m "Update technical docs" && git push
```

`Home.md` is the landing page and `_Sidebar.md` is the navigation. Keep these pages in sync with `README.md`, `STRUCTURE.md`, `docs/`; the repo files are the source of truth.
