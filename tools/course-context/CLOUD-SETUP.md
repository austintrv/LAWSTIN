# LAWSTIN cloud connection

The cloud connector runs in LAWSTIN's existing Supabase project. It can ask LAWSTIN's saved multiple-choice questions and record your answers while your Mac is off. A separate Google-hosted connection gives it the five existing Drive handoffs. Work is excluded.

## Start here

Open [LAWSTIN → Connected apps](https://austintrv.github.io/LAWSTIN/#/connect) on your Mac and sign in with your usual LAWSTIN account. No new Node install, ZIP, or Terminal command is needed.

### 1. Turn on cloud sign-in once

1. Use **Open LAWSTIN's Supabase project** in the Chat quizzes card. Supabase is the service LAWSTIN already uses to store questions and progress.
2. Open **Authentication → OAuth Server**. Turn on the OAuth server and **Dynamic Client Registration**. Set **Authorization Path** to `/` and save.
3. Under **Authentication → URL Configuration**, set **Site URL** to `https://austintrv.github.io/LAWSTIN` (without a trailing slash) and save. With the authorization path `/`, sign-in requests return to the existing LAWSTIN page.
4. Return to Connected apps and click **Refresh connection status**. Available discovery confirms the settings are visible; connecting an AI app is the full sign-in check.

These account settings cannot be changed through the Supabase tools available in the current setup session. Do not paste your LAWSTIN password or any Supabase secret into a chat or connector field.

### 2. Connect ChatGPT and Claude

For ChatGPT, open the existing private **LAWSTIN Course Context** plugin from the Connected apps page. It has been updated to a cloud connection, so it no longer needs your Mac. Connect its tools and sign in to LAWSTIN when asked. The plugin remains private.

For Claude, open **Customize → Connectors → Add custom connector**, name it **LAWSTIN**, and paste the **Connection URL** from the page. Connect, sign in to LAWSTIN, and approve the request. Start a fresh cloud chat after connecting. Desktop local MCP settings do not automatically become cloud connectors.

Codex and local Claude Code can also use Streamable HTTP with OAuth at that same connection URL, or keep their existing Mac connection for local handoffs. A cloud container cannot use a Mac filesystem alias.

### 3. Try a saved-question quiz

Say: **“Quiz me on International Law from LAWSTIN and save my answers.”**

The connector serves the saved bank for International Law, Asylum Law, and Professional Responsibility. Mixed, due-review, and new-question queues are supported. It presents one question, waits for a clear A–D response, and returns the grade and explanation only after submission. Saved answers update the same progress, daily totals, streak, and review schedule as the app. Retries count once. Repeats, silence, and skips do not add answers; uncertain speech should be clarified.

In ChatGPT on the phone, use your **Work voice** chat with LAWSTIN connected. First try one answer and one skip, then open LAWSTIN and check Progress. Connected-app availability in the actual mobile voice account still needs this end-to-end check; deployment alone does not verify it. An ordinary quiz built from Drive materials is not automatically a saved LAWSTIN question and cannot be recorded as one.

## Optional: connect the five Drive handoffs

Saved-question quizzes work independently of this step.

1. In Connected apps, click **Open Google Apps Script**. Use the Google account that owns the school course folders. Create a project named **LAWSTIN Course Handoffs**.
2. Click **Copy setup code** in LAWSTIN. In Google's editor, replace the starter contents of `Code.gs` with that code, then save. The generated code contains a private signing key; keep it in your own script project.
3. Choose **Deploy → New deployment**. Click the deployment-type gear and choose **Web app**. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy**, choose **Authorize access**, and select that same Google account. Google may label your own unpublished script unverified. Review the script and its requested Drive permission before continuing through Google's own authorization screen. The script requires Drive access to read and update the existing Markdown files.
5. Copy the **Web app URL** ending in `/exec`. Paste it into LAWSTIN's **Google deployment URL** field and click **Connect Drive**. LAWSTIN checks the signed connection and all five folders before saving it.

“Anyone” lets LAWSTIN's server reach Google's endpoint; the script rejects requests without LAWSTIN's HMAC signature. Its operations are restricted to the four shared Markdown filenames in the five configured school folders. It has no operation to read source documents or a work folder. Google grants the script owner-level Drive capability, so keep ownership of the script and do not share its key. Updating the script later requires updating the deployment's version, not just saving the editor.

The existing Drive `AI-MEMORY.md` stays canonical. Cloud writes reject stale revisions and save private history in Supabase; Mac writes continue using separate private Git repositories. Mac changes reach the cloud after Drive sync. Neither history is pushed into the public LAWSTIN repository, and the connector does not share complete chat transcripts.

## Maintainer notes

- Migrations: `20261102184122_cloud_course_connector.sql` and `20261102184636_cloud_quiz_snapshot.sql`. New tables have owner-only RLS; quiz RPCs use the existing `record_answer` and `mark_question` rules. No Auth schema or existing content tables are altered.
- Per-account folder IDs are provisioned privately in `course_context_sources`; `course_cloud_config` stores the Google deployment URL. `server_secrets` holds `course_cloud_bridge_key` (64 random hexadecimal characters) and optionally `course_cloud_plugin_url`. Do not put their values or course memories in migration files.
- Cloud source lives in `tools/course-context/`. Run `npm run context:cloud-prepare` before deploying `supabase/functions/course-cloud`. Include `index.ts`, `deno.json`, and the generated `.mjs` dependencies; explicitly pass `import_map_path: deno.json` on redeploy so the management API does not retain the previous deployment's absolute import-map path. Deploy with gateway `verify_jwt: false`: the handler verifies each bearer token with Supabase Auth and checks the owner; only health and OAuth resource metadata are public. Do not disable the handler's authentication. Generated `.mjs` copies are ignored to keep one source.
- MCP version negotiation belongs to the pinned SDK. Do not advertise protocol revisions it does not implement. Modern clients must be able to fall back from their probe to the supported initialize handshake; the HTTP integration test covers that sequence.
- The native Supabase OAuth server supplies authorization, PKCE, registration, refresh, and revocation. Existing owner RLS applies to its access tokens. No password, service-role key, signing key, or access token belongs in the plugin package.
- `npm run context:cloud-package` builds a separate cloud ZIP. Update the existing private plugin, retaining its ID, audience, and default prompt. Do not replace the local Mac installer archive with the cloud package.
- Validation: `npm test`, `npm run build`, `npm run context:test`, both package commands, and phone/desktop UI checks. `tests/sql/cloud-quiz.sql` runs transactionally in the actual database and rolls all fixtures back; it covers grading, idempotency, skips, guesses, changed questions, totals, and non-owner isolation.
