# Deploy Status

## GitHub Pages

**Expected URL:** https://emanuelteklu.github.io/epistemic-auditor/

**Status:** PENDING MANUAL SETUP

GitHub Pages needs to be enabled manually because the `gh` CLI was not available in the build environment.

### Steps to activate:

1. Merge the branch `claude/autonomous-overnight-tasks-KLMJl` into `main` (or configure Pages on the feature branch)
2. Go to **Settings > Pages** in the GitHub repository
3. Set Source to **Deploy from a branch**
4. Select the branch and `/docs` folder
5. Click Save
6. Wait ~60 seconds for the deployment to complete

### Verification:

After enabling, visit:
- https://emanuelteklu.github.io/epistemic-auditor/
- Click any example claim to verify the mock data works
- Enter a Gemini API key to verify live mode

### Files served from /docs:

- `index.html` — Complete single-file Epistemic Auditor app (340 lines)
