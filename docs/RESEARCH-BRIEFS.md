# Daily research and topic evidence briefs

Version 0.5 adds manually queued, family-local daily topic briefs. The feature is review-only. It cannot create or edit a content draft, approve work, schedule media, select credentials or publish.

## Workflow

1. Open **Research briefs** and choose a channel family.
2. Add an evidence record with its title, HTTPS URL, publisher, freshness dates, factual notes and rights/use notes.
3. Mark permission **Permitted** and analysis mode **Brief synthesis permitted** only after human review. `Unreviewed` and `Display only` evidence is saved but cannot be sent to Hermes.
4. Select 1-20 current records and choose **Prepare daily brief**.
5. Review the immutable topic cards, source links, confidence, missing evidence, uncertainties and expiry date. A response may honestly return no strong topic.
6. A failed or interrupted job is retried only by an explicit operator action. Paid attempts are capped at three; interrupted attempts require confirmation because provider usage can be unknown.

“Daily” is a family-time-zone date scope, not an unattended scheduler. Version 0.5 makes no automatic paid call.

## Durable records

- `research_evidence`: family-scoped, revisioned records with archive/restore instead of deletion.
- `research_jobs`: date, family revision, connector revision, evidence hash, prompt version, status and bounded retry chain.
- `topic_briefs`: immutable review-only payloads with an evidence snapshot and quality result.
- `research_usage`: reserved, settled, unknown or violating token usage per job and family-local month.

Duplicate submissions for the same date, evidence hash, connector revision and prompt version reuse the same job. Exact or near-duplicate topic titles against saved family content and earlier briefs are retained as `quality_failed`, not discarded or converted into drafts.

## Model boundary

Hermes receives a bounded JSON snapshot from the Control Room server. Evidence titles, URLs, publisher names, notes and rights notes are explicitly untrusted data. Immediately before each generation request, the client rechecks the authenticated Hermes capability and toolset endpoints and refuses any enabled concrete tool.

The result must be JSON with an exact schema:

- decision and rationale
- zero to three topics
- audience need and original angle
- evidence-linked “why now” and factual claims
- exactly three hooks and a bounded outline
- confidence, missing evidence and uncertainties
- expiry date

Every source ID must resolve to the selected snapshot. High confidence requires at least two distinct supplied sources. Oversized bodies, prose wrappers, malformed JSON, unknown source IDs and invalid usage data fail closed.

Hermes cannot fetch the saved URLs, modify SQLite, change a budget, create a script, approve a result or publish. Only validated Control Room transactions persist output.

## Token policy

Each family has explicit monthly, script-job and research-job token ceilings. A job reserves its full ceiling transactionally before the generation call. It is blocked before provider access if the family-local monthly limit cannot cover the reservation. Valid provider usage settles to its reported total. Missing or inconsistent usage stays conservatively reserved as unknown; above-limit usage blocks the result.

Provider-reported dollar cost is stored only if a future authenticated response supplies a trustworthy value. Version 0.5 does not invent a dollar estimate. The family’s monthly dollar budget remains a broader operating-plan field, separate from the enforced token ceilings.

## Live validation, 2026-09-11

The local restricted `youtube-control-room` profile generated one review-only brief from the official YouTube Help recommendation-system page.

- Initial job `c85fc373-ac4a-48cd-ab57-ffe53b93a4b5` failed closed because the model returned an invalid empty `missingEvidence` item. No brief was attached; usage was unavailable and its 4,000-token reservation remains conservatively classified as unknown.
- The operator deliberately retried. Job `7a97055d-43d5-4630-bc60-8f40b9390c7a` completed on attempt 2 with 1,440 prompt tokens, 615 completion tokens and 2,055 total tokens.
- Immutable review-only brief `b6c06956-0b5f-4525-bf39-b8bc99616094` was stored with complete S1 provenance and did not create or edit content.

No content record was created or changed. Desktop and 390 x 844 rendered-page checks showed the evidence selector, token summary, job history, source-linked brief and review-only warning without drafting or publishing controls.
