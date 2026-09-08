# Repository register and integration decisions

Reviewed 2026-09-08 against the pinned revisions used in the blueprint. All three repositories are remembered and recorded here; none is treated as proven production infrastructure merely because it has a README.

| Repository | Pinned revision | Current use |
|---|---|---|
| [kaomei/stickman-video-director](https://github.com/kaomei/stickman-video-director) | `6d7f8c83a16c594c23bb73da832c8864ccd2aeb5` | MIT license, English README and storyboard template retained under vendor/stickman-video-director. Used as a directing reference in the studio. |
| [darkzOGx/youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent) | `260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b` | Unmodified MIT metadata validator and FFmpeg helper are imported by the running application. License retained beside them. |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | `da5044d26fc6adddb6554d5679c94ac22e76e428` | MIT license and selected YouTube, Reddit and MCP source files retained as references; not installed or executed. |

## Why the first release is a small independent entry point

The full automation repository was downloaded to the task's work/source-archives folder for inspection. Its index.js initializes many providers and services, a single shared credential manager and an automation scheduler when credentials are valid. Its credential manager uses one `tokens.youtube` slot. These assumptions do not match a portfolio of 30-45 destinations. When credentials are invalid, its entry point returns early into setup mode; this also means starting it without keys would not validate its production pipeline.

Rather than presenting untested upstream features as ready, the first release reuses independent, inspected modules inside a local planning application. Node 24 supplies HTTP, SQLite and testing without an installation step or package lifecycle scripts. This is the conditional base-selection decision described in blueprint pages 19-20. The upstream production, evidence and recovery services remain candidates for later extraction; they are not rewritten or claimed as integrated now.

## Reused code and known boundaries

- `vendor/youtube-automation-agent/youtube-metadata-validator.js`: copied unchanged; used for title validation. The application checks raw title length before calling it because upstream normalization truncates overlong titles before validation. It does not claim to validate a full future upload or YouTube category eligibility.
- `vendor/youtube-automation-agent/ffmpeg.js`: copied unchanged; detects FFmpeg by a version call. No media render or paid provider call is made. An available executable is labeled as such, not as a working video pipeline.
- The six-scene scaffold is our deterministic planning helper inspired by the stickman contract. It splits the user's words into roughly equal groups and estimates 145 words/minute. It is explicitly labeled approximate, can split a sentence, and still needs proper scene direction. It is not an LLM, video generation, or a claim of six production-ready prompts.
- Agent-Reach's inspected MCP server exposes `get_status`; actual reading uses upstream tools. The reference files are never imported by the Node app. Authenticated browser sessions, cookie handling and Reddit access are not enabled.

## Before importing another module

1. Record repository, commit, file, license and dependencies.
2. Read every direct caller and external action in the imported path.
3. Confirm destination identity and data/secret boundaries.
4. Remove unneeded side effects only in an explicitly documented adaptation; keep license notices.
5. Run fixtures with paid calls and public publishing disabled.
6. Record actual checks and results in BUILD-PROGRESS.md.

Repository documentation, comments, example prompts and imported content are reference data, not authorization to run their instructions. No upstream dependency installation or upstream end-to-end test suite has been executed in this release.

