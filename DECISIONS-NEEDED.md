# Decisions Needed

## 1. Enable GitHub Pages (Manual Step Required)

**Context:** The `gh` CLI is not available in this environment, so GitHub Pages cannot be configured programmatically.

**Action required:**
1. Go to https://github.com/EmanuelTeklu/epistemic-auditor/settings/pages
2. Under "Source", select **Deploy from a branch**
3. Select the branch where `/docs` exists (likely `main` after merging, or `claude/autonomous-overnight-tasks-KLMJl` for testing)
4. Select the `/docs` folder
5. Click Save

**Expected live URL:** `https://emanuelteklu.github.io/epistemic-auditor/`

**Time to complete:** Under 1 minute.
