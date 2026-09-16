# Hermes reasoning-engine setup

Version 0.5 connects the Control Room to a dedicated local Hermes Agent API for quality-gated script candidates in each family’s selected primary locale and review-only daily topic briefs. Results are stored separately and never change or approve a saved draft automatically.

## Boundary

- Control Room remains the source of truth for families, content revisions, evidence, approvals, jobs, budgets and future publishing.
- Hermes is called server-to-server at the fixed loopback address `http://127.0.0.1:8642`.
- The browser never receives the Hermes bearer key and never calls Hermes directly.
- One request creates one bounded result. There are no automatic retries. Terminal jobs expose a deliberate retry action, capped at three paid attempts. Budget-blocked checks consume no paid attempt.
- Factual jobs require saved sources marked permitted with meaningful evidence notes.
- Hermes output must match the exact local candidate schema. Prose wrappers, unknown source IDs and oversized or malformed responses fail closed.
- A result arriving after its content, family or connector revision changed is marked stale and is not attached.
- A process restart during a running Hermes request marks the job interrupted instead of silently spending again. Retrying an interrupted request requires a separate warning confirmation because the provider outcome and spend are unknown.
- Before generation and before attaching a result, Control Room rechecks that the same-revision Hermes connector still exists, still has a protected key, and its latest test status is passed.
- Each family has explicit monthly, script-job and research-job token ceilings. Admission reserves the per-job ceiling transactionally; insufficient monthly capacity causes zero completion calls. Valid usage settles to the reported total. Missing/inconsistent usage remains conservatively reserved and blocks the result.
- Long-form candidates require 600-1,200 words with an 800-1,000 target, four distinct paragraphs, the exact returned hook in the opening and a complete payoff. Shorts require 80-180 words with a 110-150 target and two paragraphs. A schema-valid but weak paid result is retained as `quality_failed` and cannot be used.

## Prepare a dedicated Hermes profile

Use a separate profile rather than the everyday default agent. The script milestone needs reasoning only; it does not need terminal, filesystem, browser, publishing or persistent-memory access.

1. Create a profile:

   ```text
   hermes profile create youtube-control-room
   ```

2. Configure that profile's model/provider:

   ```text
   hermes -p youtube-control-room model
   ```

3. Open its tool configuration and disable **every toolset that exposes any concrete tool** for this first milestone:

   ```text
   hermes -p youtube-control-room tools
   ```

4. Configure the profile's gateway/API server:

   ```text
   hermes -p youtube-control-room gateway setup
   ```

   Enable the API server, keep host `127.0.0.1`, use port `8642`, and create a strong unique API server key. Keep that key out of GitHub, screenshots, documentation and chat.

   The Control Room connector test reads authenticated `/v1/toolsets` and fails closed if any enabled entry has a non-empty `tools` list. Disabling only terminal/browser is insufficient if another enabled built-in, MCP or plugin toolset still exposes tools.

5. Start the profile gateway:

   ```text
   hermes -p youtube-control-room gateway
   ```

6. Confirm local liveness:

   ```text
   http://127.0.0.1:8642/health
   ```

Hermes requires bearer authentication even on loopback. Do not enable browser CORS for this integration.

## Connect it in Control Room

1. Start YouTube Control Room and open **Connections**.
2. Select **Add connector**.
3. Choose **Hermes reasoning engine**.
4. Enter a name such as `Hermes soul` and paste the same API server key.
5. Save, then select **Test**. The test makes authenticated, size-bounded capability and toolset-list requests; it does not generate content. A pass means chat completions are available and the API-server profile currently exposes no concrete tools.
6. Open **Content studio**. A draft with eligible evidence will show **Ask Hermes** after the connector test passes.
7. The generated result appears as a quality-passed candidate or a quality-blocked diagnostic result.
8. Review the candidate's claims and supplied source IDs, then select **Use candidate** to copy it into the existing edit form. Factual candidates without at least one sourced claim are rejected. Nothing is saved until the operator reviews and submits that form. Saving creates a new content revision and invokes the existing approval-invalidation rules.
9. If a job ends failed, stale, cancelled, quality-blocked or usage-unknown, select **Retry Hermes** deliberately. Attempt 3 is the paid-attempt ceiling. A budget-blocked recheck does not consume another paid attempt. An interrupted job additionally shows an unknown-outcome confirmation; cancel that prompt if provider activity or spend has not yet been reconciled.

## Live validation record

On 2026-09-10, the operator machine created a separate `youtube-control-room` profile with no bundled skills, no MCP servers and every API-server toolset disabled. Its authenticated capability and toolset checks passed. One live factual candidate was generated from an official YouTube Help source. It completed on the first attempt with 1,974 total tokens, four source-linked claims and three uncertainties; the saved draft remained unchanged and the candidate/source links rendered in Content Studio.

On 2026-09-11, the new gate reclassified that 267-word record as `quality_failed`, with no change to its immutable payload. A fresh live generation completed on its first attempt as candidate `c8e4869c-9e5f-4525-bf39-b8bc99616094`: 888 words, all quality checks passed, 1,383 prompt tokens, 1,472 completion tokens and 2,855 total tokens. The original saved draft remained unchanged. The provider did not report a trustworthy dollar cost, so the application shows no invented estimate and enforces the explicit token ceilings instead. P01 is complete.

Daily evidence briefs use the same restricted profile and budget boundary. See [RESEARCH-BRIEFS.md](RESEARCH-BRIEFS.md). Automated or external evidence collection, optional localization into each family’s configured additional locales, voice, rendering and publishing remain separate later milestones.

Official references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
