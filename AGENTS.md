# LAWSTIN project instructions

Read `AI-MEMORY.md` before working here and keep its project facts and Current work current. Follow the relevant task skill under `skills/` when applicable. The current user request controls over historical memory.

This is a public repository. The five school courses' shared memories live in their existing Google Drive `AI & CLOUD` folders. Never commit course memories, private local MCP configuration/history, clinic facts, student submissions, or credentials here. The work project is excluded from the course integration.

The course-context tool source is in `tools/course-context/`. See its README and Mac/cloud setup guides. Git history of course context belongs privately on the Mac, outside Drive and this checkout; cloud version history belongs in owner-protected Supabase rows. Do not claim local desktop apps were configured from a cloud workspace.

For course-context changes, run `npm run context:test` and `npm run context:package`; run `npm run context:cloud-package` for cloud plugin changes. For app changes, use the existing tests and build. The local setup does not require database changes. The hosted connector has its own migrations and Edge Function; keep it separate from the app's content-generation tasks.
