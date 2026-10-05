# Editing Room timeline: data model, operations, auto-edit algorithms and FFmpeg recipes

This report comes from reading five repositories. It specifies a professional editing timeline that a zero-dependency Node.js app can implement with FFmpeg, SQLite immutable revisions and human approval gates.

**Sources and licences**

| Repository | Licence | How it is used here |
|---|---|---|
| palmier-pro (Swift NLE, `last-gpl-source`) | GPLv3 | Ideas only. Restated in my own words, no code copied. |
| capcut-cli (TypeScript) | MIT | Rules and thresholds adopted directly. |
| lossless-cut (Electron/TS) | GPL-2.0 | Ideas only. FFmpeg filter parameters are quoted because they are FFmpeg facts. |
| open-higgsfield, Omni-Video | No licence file found | Skimmed for ideas only. |

I ran every FFmpeg command in section 6 against synthetic `lavfi` sources on the local ffmpeg 6.1.1. I made no network calls and ran no repository scripts.

The companion file `timeline.json` holds 35 skill objects. This document is the narrative behind them.

---

## 1. Core design decisions

1. **Two time domains.** Timeline positions are integer frames at project fps, as half-open `[start, end)` ranges. Source positions are integer microseconds. One helper converts for the UI, agent tools, captions, beats and transcripts:
   `timelineFrame = clip.start + (sourceSeconds*fps − trimStartFrames) / speed`.
   - The agent never multiplies by fps itself; the tools convert (palmier).
   - palmier stores trims in project frames, which is lossy when source and project fps differ. Storing `srcInUs` avoids this, as CapCut does.
2. **One owner of mutation logic.** Preview, validation, execution, persistence and undo all call the same domain function (palmier's strongest rule). AI tools never duplicate the timeline maths.
3. **One user intent = one atomic revision.** Validate fully before touching state. Failed, refused and no-op calls create no revision. Undo is a new revision that restores the parent's content.
4. **Receipts use the read vocabulary.** Changed clips, compressed shift rules, removed ids, created tracks, markers and notes, so the agent can patch its model instead of re-reading (palmier's "mutation delta").
5. **Markers are the approval channel.** Status is `open`, `review` or `resolved`. The agent sets `review` only after applying and verifying an edit; only a human sets `resolved`.

---

## 2. Proposed timeline JSON schema

Visual tracks are listed bottom-to-top, so array order is render order and the last track renders on top. This matches how an FFmpeg overlay chain is built. palmier uses the opposite convention (index 0 on top), so state the rule in the schema.

```json
{
  "schema": "ytprod.timeline/1",
  "timelineId": "tl_01J...",
  "projectId": "prj_...",
  "revision": { "id": "rev_...", "parentId": "rev_...", "actor": "agent|human", "createdAt": "ISO-8601" },
  "settings": {
    "fps": { "num": 30, "den": 1 },
    "width": 1920, "height": 1080,
    "sampleRate": 48000, "channels": 2,
    "loudnessTarget": { "integratedLufs": -14, "truePeakDbtp": -1.5, "lra": 11 },
    "safeArea": { "titleFraction": 0.9, "verticalCaptionFraction": 0.85 }
  },
  "tracks": [
    { "id": "trk_v1", "zone": "visual", "role": "main",     "name": "A-roll",  "hidden": false, "locked": false, "syncLocked": true, "magnetic": false },
    { "id": "trk_v2", "zone": "visual", "role": "overlay",  "name": "B-roll",  "hidden": false, "locked": false, "syncLocked": true },
    { "id": "trk_g1", "zone": "visual", "role": "graphics", "name": "Graphics" },
    { "id": "trk_t1", "zone": "visual", "role": "text",     "name": "Titles" },
    { "id": "trk_c1", "zone": "visual", "role": "captions", "name": "Captions" },
    { "id": "trk_a1", "zone": "audio",  "role": "dialogue", "name": "Dialogue", "muted": false, "syncLocked": true },
    { "id": "trk_a2", "zone": "audio",  "role": "narration","name": "VO" },
    { "id": "trk_a3", "zone": "audio",  "role": "music",    "name": "Music", "duckUnder": ["narration", "dialogue"] },
    { "id": "trk_a4", "zone": "audio",  "role": "sfx",      "name": "SFX" }
  ],
  "clips": [
    {
      "id": "clp_...", "trackId": "trk_v1",
      "assetRef": "ast_... | tl_... (nested timeline)", "mediaType": "video|image|text|lottie|sequence|audio",
      "startFrame": 0, "durationFrames": 150,
      "srcInUs": 2500000, "speed": 1.0, "reverse": false,
      "linkGroupId": "lnk_...", "captionGroupId": null, "multicamGroupId": null,
      "visual": {
        "opacity": 1.0, "blendMode": "normal",
        "transform": { "centerX": 0.5, "centerY": 0.5, "width": 1.0, "height": 1.0, "rotationDeg": 0, "flipH": false, "flipV": false },
        "crop": { "left": 0, "top": 0, "right": 0, "bottom": 0 },
        "fit": "cover|fit|stretch", "anchorX": 0.5, "anchorY": 0.5,
        "edgeRounding": 0, "edgeSoftness": 0
      },
      "audio": { "gainDb": 0, "pan": 0 },
      "fades": { "inFrames": 0, "outFrames": 0, "inCurve": "linear|smooth", "outCurve": "linear|smooth" },
      "keyframes": {
        "position": [{ "f": 0, "v": [0, 0], "interp": "smooth" }, { "f": 149, "v": [-0.05, -0.04] }],
        "scale":    [{ "f": 0, "v": [1, 1], "interp": "smooth" }, { "f": 149, "v": [1.1, 1.1] }],
        "rotation": [], "opacity": [], "crop": [], "blur": [], "volumeDb": []
      },
      "effects": [ { "type": "color.exposure", "params": { "ev": 0.2 }, "enabled": true } ],
      "text": null,
      "provenance": { "createdBy": "agent|human", "op": "remove_words", "revisionId": "rev_..." }
    },
    {
      "id": "clp_cap_...", "trackId": "trk_c1", "mediaType": "text", "captionGroupId": "cg_...",
      "startFrame": 30, "durationFrames": 48,
      "text": {
        "content": "This is karaoke", "styleRef": "style_caption_clean",
        "animation": { "preset": "highlightPop", "highlightColor": "#FFD700" },
        "wordTimings": [ { "w": "This", "s": 0, "e": 12 }, { "w": "is", "s": 12, "e": 22 }, { "w": "karaoke", "s": 22, "e": 48 } ]
      }
    }
  ],
  "transitions": [
    { "id": "trn_...", "trackId": "trk_v1", "fromClipId": "clp_a", "toClipId": "clp_b",
      "type": "crossfade|dip_to_black|dip_to_white|wipe_left|slide", "durationFrames": 12, "alignment": "center|start|end" }
  ],
  "markers": [
    { "id": "mrk_...", "startFrame": 900, "durationFrames": 0, "name": "Retake?", "comment": "Earlier take at 0:28 matches 0.86",
      "color": "#007AFF", "status": "open|review|resolved", "kind": "note|chapter|beat|emphasis|todo|retake", "createdBy": "agent" }
  ],
  "captionGroups": [
    { "id": "cg_...", "trackId": "trk_c1", "source": "transcript|srt", "language": "en",
      "limits": { "maxCharsPerLine": 42, "maxLines": 2, "maxCps": 20, "maxGapMs": 500, "maxWords": null } }
  ],
  "analysis": {
    "transcriptRef": "trn_...", "vadRef": "vad_...", "beatsRef": "beat_...",
    "lint": { "errors": 0, "warnings": 3, "info": 2 }
  }
}
```

**Invariants**

- Clips:
  - No overlap on a track: for consecutive clips, `end ≤ next.start`.
  - `durationFrames ≥ 1`.
  - `speed > 0` and finite.
  - `srcInUs + durationFrames/fps·speed·1e6 ≤ asset.durationUs`, with a one-frame tolerance. Stills and Lottie are exempt.
- Fades and keyframes:
  - `fades.in + fades.out ≤ durationFrames`.
  - Keyframes are clip-relative, sorted, unique, and within `[0, duration)`.
- Links:
  - A link group has ≥ 2 members of different media types.
  - A text partner skips trim and speed propagation.
- Transitions need handles. A centre-aligned transition of length T needs T/2 of media beyond the outgoing out-point and T/2 before the incoming in-point.
- Nested timelines (`assetRef` = timelineId) may not form cycles and may not be empty.

---

## 3. Operation set

### 3.1 Contract rules for every op

These are restated from palmier's AGENTS.md and its tool executor.

- **Strict input.** Reject unknown keys and mixed modes. Require exact types, finite numbers, explicit bounds and existing ids.
- **Resolve, then apply.** Validate the whole plan, then apply it in one transaction. One bad entry means nothing is applied.
- **No silent adjustment.** Never clamp, retarget or fall back unless the contract says so, and report it when it happens. Refusals name the blocker, e.g. `Sync-locked track "V2" doesn't have room to ripple`.
- **No empty revisions.** A no-op returns `noop: true` and creates no revision.

**Receipt structure**

```json
{
  "revisionId": "rev_...", "noop": false,
  "clips": [ { "id": "clp_..", "track": 0, "frames": [120, 270], "...": "only non-default fields" } ],
  "shifted": [ { "track": 0, "fromFrame": 300, "by": -45, "count": 17 } ],
  "removedClipIds": [], "markers": [], "removedMarkerIds": [],
  "createdTracks": [ { "index": 5, "type": "audio", "label": "A3" } ],
  "notes": ["Track indices shifted - re-read before the next index-based call"],
  "warnings": [], "skipped": [],
  "lintDelta": { "added": [], "resolved": [] }
}
```

- Uniform moves of three or more clips on one track collapse into a single `shifted` rule. Smaller groups are listed clip by clip.
- `clips` is capped at about 30 entries, after which a note asks the agent to re-read.
- Ids are printed as unique prefixes of at least 8 characters. Either prefixes or full ids are accepted as input.

### 3.2 Operations

| Op | Preconditions / validation | Effect | Receipt extras |
|---|---|---|---|
| `create_timeline(name?, from?)` | `from` must exist | Empty timeline, or a deep copy with all-new ids (the versioning primitive) | timelineId |
| `set_settings(fps / width+height / aspect / quality)` | width+height is exclusive with aspect/quality | Re-fits auto-fit transforms. A new fps rescales every frame value | changed clip count |
| `manage_tracks(reorder / set / remove)` | Reorder stays within its zone. Remove requires an empty track or `force`. Multicam tracks are protected | Runs reorder → set → remove | new track order |
| `add_clips(entries)` (overwrite) | Asset/track type compatible. `start ≥ 0`. `endFrame > start`. `source` [s,e] and `endFrame` are mutually exclusive. Source span must fit the asset | Clears the landing region (remove, head-trim, tail-trim or split). Auto-creates linked audio | created clip ids, createdTracks |
| `insert_clips(trackId, atFrame, entries)` | Track exists. `atFrame ≥ 0` | Entries laid end-to-end. Pushes the target track, sync-locked tracks and the linked-audio track | shifted rules |
| `move_clips(moves)` | Each move has `toTrack` and/or `toFrame`. Zone compatible. Multicam groups move whole | Overwrite at the destination. Partners shift by the same delta, which keeps J/L offsets | clips, removed |
| `remove_clips(ids)` (lift) | Ids exist | Expands to the whole link group and leaves a gap | removedClipIds |
| `ripple_delete_ranges(trackId, ranges)` or `(clipId, ranges, units)` | `end > start`. Seconds are only allowed in clipId mode. Pre-flight refuses if a sync-locked follower would go below 0 or collide | Merges ranges, cuts partners, shifts followers, remaps markers | removedFrames, anchor track layout |
| `split_clips(splits)` or `(trackId, frames)` | Each frame strictly inside a clip. Duplicates ignored | Partners split at the same frame. Right halves become a new link pair | new right-half ids |
| `trim(clipId, edge, delta, mode)`, mode = trim, ripple, roll, slip or slide | Within media handles. Multicam timing is refused | See skill `insert-ripple-and-gap-ops` | clips, shifted |
| `set_clip_properties(clipIds, props)` | Bounds: gainDb −60..+15, opacity 0..1, edge 0..1, crop leaves ≥ 5% visible, fades fit the duration, blendMode only on visual clips | Applies the same values to all ids. Timing fields propagate to partners. Setting a static value clears that property's keyframes | clips |
| `set_keyframes(clipId, property, rows)` | Rows `[f, ...v, interp?]`. Values finite. Property supported by the media type | Replaces the property's keyframe track. An empty array clears it | clip |
| `copy_clip_settings(source, targets / track+range)` | Same media type | Copies static look, text style or audio treatment. Never copies timing, links or keyframes | matched / changed / unchanged counts |
| `apply_layout(layout, slots, anchors, fit)` | Every slot filled. Re-layout and placement modes are not mixed | Computes transform+crop for cover or fit | clips |
| `manage_clip_links(link / unlink)` | Link needs ≥ 2 different media types | Merges or dissolves groups | groups |
| `swap_clip_media(clipId, assetRef)` | Same type. Has audio if a linked partner needs it. Covers the current source range | Preserves timing, framing, effects and keyframes | clip |
| `add_transition / remove_transition` | Clips are adjacent on one track. Handles are sufficient | Stores the transition on the cut | transition |
| `add_texts / update_text / add_captions` | Text clips only on non-audio tracks | Caption group per run | captionGroup summary |
| `remove_silence(clipIds?, minPause?, padding?)` | 0.25 ≤ minPause ≤ 3.0. 0 ≤ padding ≤ 0.5. Scope is one track or one linked unit | VAD dead-air ripple | sectionsRemoved, removedFrames |
| `remove_words(words / matches, aggressiveness)` | The transcript session must match the current timeline. One track or one linked unit | Word-gap ripple cuts | removedText, removedFrames |
| `remove_retakes(pairs)` | Pairs come from detection and have been confirmed by a human | Ripple-deletes the earlier takes | cut spans |
| `snap_cuts_to_beats(trackId, tolerance)` | Beat analysis exists | Roll edits each cut to the nearest downbeat | snapped / skipped |
| `duck_music(trackId, depthDb, attack, release)` | VAD exists on the voice tracks | Writes volume keyframes | keyframe count |
| `punch_in(clipIds / auto, scale, anchor)` | Enough source resolution | Splits and applies a static scale | clips |
| `manage_markers(create / update / delete)` | Name ≤ 120 chars. Comment ≤ 4000. Agent cannot set `resolved` | — | marker |
| `undo()` | — | New revision equal to the parent | restored revision |
| `export(mode, …)` | Lint has no errors. Approval exists | Queued job with an id | jobId, status |

---

## 4. The AI-editor tool surface in palmier (paraphrased)

palmier ships an in-app agent and an MCP server at `127.0.0.1:19789/mcp`. Both go through one tool executor, and it exposes about 45 tools.

**Grouping**

- **Project and timeline:** get, inspect, create or duplicate, and switch timelines; markers; settings; export and export queue.
- **Media:** list; inspect (frames, transcript, storyboard); semantic visual/spoken search returning source-second ranges; import; capture a frame.
- **Clips:** tracks; links; add; insert; move; remove; split; ripple-delete ranges; swap media; properties; copy settings; keyframes; layouts; sync (timecode first, then audio correlation with minimum confidence 0.5); undo; three multicam tools.
- **Transcript:** get transcript (stable word indices or sentence segments); remove words; remove silence; detect beats.
- **Text:** add texts; update text (one clip or a whole caption group); add captions (transcribe, or place an SRT/VTT).
- **Look:** colour knobs that merge onto the grade, with curves and LUTs; colour scopes with the gap to a reference; a fixed-order effect stack; denoise.
- **Generation:** models, video/image/audio generation and upscaling, all behind confirmation.

**How mutations are verified**

1. **Validation before mutation.** Arguments are checked against an allow-list with specific errors (e.g. "Frame X is not strictly inside any clip on track N") before any undo group opens.
2. **Snapshot diffing.** The executor snapshots clip placements, track ids and markers before the tool runs, then diffs afterwards: touched and new clips in full, same-track shifts as rules, removed clips, marker changes, created tracks, and a note if track indices moved.
3. **Stale-state guards.** `remove_words` refuses if the word mapping changed since the last `get_transcript`. Writes pause while the bound project is not visible. Agent and human share one undo history.
4. **Visual verification.** `inspect_timeline` renders composited frames with a 0–1 grid and burned-in frame number, and lists the clip ids visible in each frame, top-down.
5. **Editorial verification.** After cutting, the agent re-reads the transcript as prose and undoes any cut that overshot.

**Cut-tool preference order:** `remove_silence` → `remove_words` → `ripple_delete_ranges` → `split_clips`.

**Ids** are output as the shortest unique UUID prefix (at least 8 characters). Inputs accept either a prefix or the full id.

capcut-cli adds three ideas worth copying:

- A transactional JSONL `batch`: one failing operation writes nothing.
- A `describe` command that emits the full command surface as JSON, so the agent's tool spec has one source of truth.
- `compile --check/--plan`, which performs a dry run of a declarative spec.

---

## 5. Automatic editing algorithms and parameters

### 5.1 Dead air (VAD, adaptive). Source: palmier

- **Analysis cells.** Decode mono 16 kHz audio and run VAD in 512-sample cells (32 ms). Take each cell's peak level in dB with a floor of −50 dB.
- **Quiet threshold.** Compute the median peak over the speech cells, call it L. The quiet floor is `clamp(L − 12 dB, −40, −22)`. If no speech is detected, use −28 dB.
- **Dead-air decision.** A non-speech run counts as dead air only if its median peak is at or below the quiet floor. Music beds and loud ambience therefore survive.
- **Minimum pause** 0.5 s (range 0.25–3.0). **Speech padding** 0.15 s (range 0–0.5), applied only on sides that touch speech.
- Ripple-delete on one track or linked unit, as one revision.

**FFmpeg-only fallback** (capcut-cli): `silencedetect=noise=-30dB:d=0.5` with 0.1 s padding. For finding true blank gaps, lossless-cut's `-60dB` with `d=2.0` is the right setting.

### 5.2 Word-boundary cuts. Source: palmier

For each run of selected words, cut from `prevEnd + min(gap, k/2)` to `nextStart − min(gap, k/2)`. The surviving pause therefore equals the kept gap k:

| Aggressiveness | Kept gap k |
|---|---|
| tight | 60 ms |
| balanced (default) | 150 ms |
| loose | 320 ms |

Rules:

- Cuts always fall in inter-word gaps, never inside a word.
- One track or linked unit per call.
- Re-read the transcript after every cut, because word indices shift.
- Filler matching uses lowercase, punctuation-trimmed tokens.

### 5.3 Retakes. Source: capcut-cli

- Search window 60 s, similarity ≥ 0.8 (measured as `2·LCS/(|a|+|b|)` on normalized tokens), at least 4 words.
- The later take wins.
- The window bound exists because an unbounded search once collapsed a 29-minute recording to under 2 minutes.

### 5.4 Script ↔ ASR alignment. Source: capcut-cli

- Needleman–Wunsch alignment. Scoring: match +2; near-miss +1 (edit distance ÷ longer length ≤ 0.4); mismatch −1; gap −1.
- Missed script words are interpolated between their timed neighbours. At the edges, use the median recognized word duration.
- Report `match_ratio`. Below 0.5, the script probably belongs to different audio.

### 5.5 Scene, black and freeze detection

- **Scene cuts:** `select='gt(scene,T)',metadata=print`.
  - T = 0.4 for hard cuts (capcut-cli). lossless-cut defaults to 0.3 and recommends 0.3–0.5.
  - Merge cuts closer than 2 s.
  - `scdet=threshold=10` (a percentage) is the newer alternative.
- **Black:** `blackdetect=d=2.0:pic_th=0.98:pix_th=0.10` for segmenting. Use `d=0.1` for QC flash detection.
  - Bounding mode cuts the black span itself.
  - Midpoint mode splits programme parts at the middle of each black span.
- **Freeze:** `freezedetect=n=-60dB:d=2`.

### 5.6 Beats. Source: palmier

- palmier runs a beat model on mono 22,050 Hz audio with a hop of 441 samples, i.e. 50 analysis frames per second.
- A frame is a beat or downbeat when `sigmoid(logit) ≥ 0.5` and it is a local maximum. BPM = 60 ÷ median inter-beat interval.
- Editing rule: cut on downbeats (bar starts). Use plain beats only for fast montages.
- To place a beat B on the timeline: `start + (B·fps − trimStart)/speed`.

**Without a model** (my design):

1. Decode with FFmpeg to PCM.
2. Compute a spectral-flux onset envelope at 50 fps in Node. A small radix-2 FFT is enough, and zero dependencies are fine.
3. Estimate tempo by autocorrelation over 60–180 BPM.
4. Track beats by dynamic programming.
5. Choose the downbeat phase as the beat-of-4 with the most low-band energy.
6. Snap cuts that fall within ±4 frames of a downbeat.

### 5.7 Caption segmentation

palmier's method:

- Recursively split each transcript segment until it fits: first at sentence punctuation followed by a space (which keeps "U.S." and "3.14" intact), then at clause punctuation, then at the middle word.
- "Fits" means width ≤ 90% of the canvas, plus the optional word and character caps.
- Time each phrase by consuming words by alphanumeric character count.
- Resolve overlaps, then extend each caption to the next if the gap is ≤ 0.5 s (range 0–2). Hold the last caption for up to the same gap.

capcut-cli's settings:

- Karaoke grouping: at most 4 words, at most 28 characters, and a new cue whenever an inter-word gap exceeds 500 ms. Lines are at most 42 characters.
- CJK limits, as characters per line / characters per second: zh 16/9, ja 13/4, ko 16/12. CJK words are joined without spaces.
- Keyword emphasis: highlight colour `#FFD700` and a size multiplier of 1.2.

### 5.8 Punch-in on emphasis and J/L cuts

No source repository implements either of these. The parameters below are editorial heuristics.

**Punch-ins**

- At jump-cut seams between same-source segments, alternate scale between 1.0 and 1.15. Anchor at Y 0.35–0.4 so the eyes stay in the upper third.
- Emphasis candidates are keywords, words followed by "!" or "?", and words whose RMS is at least 6 dB above the sentence median.
- Split 2 frames before the word. Keep at least 2.5 s between punch-ins. Skip segments shorter than 1 s.
- Implement as a split plus a static crop and scale. It is exact and cannot jitter.

**J/L cuts**

- L-cut: audio trails the picture cut by 6–20 frames at 30 fps. J-cut: audio leads it by 6–15 frames.
- Build them by unlinking, rolling one side, then relinking. Moves preserve the offset because partners shift by the same delta (palmier).

---

## 6. FFmpeg recipes (all validated on ffmpeg 6.1.1)

**Render graph core.** Each clip is normalized, then the main track is concatenated, crossfaded and overlaid:

```text
[0:v]trim=start=S:duration=D,setpts=(PTS-STARTPTS)/SPEED,fps=30,
     scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,
     setsar=1,format=yuv420p,settb=AVTB[v0];
...
[v0][v1]concat=n=2:v=1:a=0,settb=AVTB[c01];
[c01][v2]xfade=transition=fade:duration=0.5:offset=3.5[vx];
[pip]... ;[vx][pip]overlay=x=W-w-0.035*W:y=H-h-0.035*H:enable='between(t,1,4)'[vout];
[0:a]atrim=1:5,asetpts=PTS-STARTPTS[a01];[1:a]atrim=0:4,asetpts=PTS-STARTPTS,atempo=2.0[a2];
[a01][a2]acrossfade=d=0.5[aout]
```

> **Validation finding:** `xfade` failed until both inputs shared a timebase. The error was "First input link main timebase (1/1000000) do not match … (1/30)". Always end each normalized branch, and every `concat` output, with `settb=AVTB`.

**Static punch-in** (exact):

```text
crop=iw/1.15:ih/1.15:(iw-ow)/2:(ih-oh)*0.4,scale=1920:1080
```

**Smooth keyframed zoom on video.** `scale` with `eval=frame` followed by a fixed crop works in 6.1.1 and gave a constant 1280×720 output:

```text
scale=w='trunc(1280*(1+0.2*min(1,t/2))/2)*2':h=-2:eval=frame,crop=1280:720:(iw-1280)/2:(ih-720)/2
```

**Ken Burns on stills.** Oversample, then `zoompan`:

```text
scale=4*iw:-2,zoompan=z='1+0.2*min(1,on/60)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=1920x1080:fps=30
```

For video use `d=1` with `it` (input seconds) in the zoom expression.

**Speed ramp.** One piecewise time map: 1× until 2 s, then 2×. A 6 s source became 4 s:

```text
setpts='if(lt(T,2),T,2+(T-2)/2)/TB'
```

**Audio speed.** Chain `atempo` factors that each sit within 0.5–2:

- 4× is `atempo=2.0,atempo=2.0` (a 6 s source became 1.49 s);
- 0.25× is `atempo=0.5,atempo=0.5`.

**Ducking, sidechain style:**

```text
[0:a]asplit=2[vo][key];[1:a]aformat=...[mus];
[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350:makeup=1[duck];
[vo][duck]amix=inputs=2:duration=first:normalize=0[mix]
```

`normalize=0` matters: without it `amix` lowers every input according to the input count.

**Ducking, as an envelope.** This is the approach I recommend, because the envelope lives on the timeline as volume keyframes:

```text
volume='if(between(t,1.0,3.5),0.178,1)':eval=frame     # 0.178 ≈ -15 dB
```

**Loudness, two-pass:**

```text
pass 1: -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -
pass 2: -af loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true,aresample=48000
verify: -af ebur128=peak=true -f null -        (got I = -14.0 LUFS on the test file)
clip:   -af astats=metadata=0 -f null -         (check "Number of samples clipped")
```

**Captions.** Write an ASS file with styles and `{\kNN}` karaoke tags, then apply `subtitles=captions.ass`. Use `drawtext ... enable='between(t,a,b)'` only for simple titles. Soft captions go in as a `mov_text` stream plus a sidecar SRT; drop `-shortest` when muxing subtitles.

**Detection** (all print to stderr or stdout for Node to parse):

```text
silencedetect=noise=-30dB:d=0.5
blackdetect=d=0.1:pic_th=0.98:pix_th=0.10
freezedetect=n=-60dB:d=2
select='gt(scene,0.4)',metadata=print:file=-
```

**PCM for Node analysis** (VAD, beats, emphasis RMS):

```text
ffmpeg -i in -ac 1 -ar 16000 -f s16le -
```

**Keyframes for smart cut:**

```text
ffprobe -read_intervals A%B -select_streams v:0 -show_entries packet=pts_time,flags -of json
```

**QC still:**

```text
-vf "drawgrid=w=iw/10:h=ih/10:t=1:c=white@0.4,drawtext=text='f%{frame_num}':start_number=F:..."
```

**Chapters:**

```text
;FFMETADATA1 / [CHAPTER] TIMEBASE=1/1000 START END title
then: -map_metadata 1 -map_chapters 1 -c copy
```

---

## 7. Lint rules

| Code | Severity | Rule | Fixable | Origin |
|---|---|---|---|---|
| clip-overlap | error | clips overlap on one track | no | invariant |
| caption-overlap | error | `next.start < prev.end` on a caption track | yes (trim prev) | capcut-cli |
| missing-asset / missing-file | error | asset or file not found | no (relink) | capcut-cli |
| source-range-exceeds-asset | error | `srcIn + consumed > asset duration + 1 frame` | no | capcut-cli (CapCut clamps the in-point to 0) |
| keyframe-out-of-range | error | key frame ≥ clip duration | yes (clamp/drop) | palmier |
| main-track-gap | warning | unintended black between main-track clips | only if dependants shift in lockstep | capcut-cli |
| flash-frame | warning | visual clip or gap shorter than 3 frames | no | recommendation |
| linked-av-out-of-sync | warning | a link group's A/V offset changed unexpectedly | no | palmier |
| speed-timerange-mismatch | warning | `|srcDur/tgtDur − speed| / speed > 1%` | re-apply speed | capcut-cli |
| fades-exceed-duration | warning | `in + out > duration` | yes (clamp) | palmier |
| too-long-hold | warning | no visual change for more than 8 s (long-form) or 4 s (Shorts) | no | recommendation |
| line-too-long | warning | caption line over 42 characters, or the CJK limit | yes (rewrap) | capcut-cli |
| caption-too-fast | warning | over 20 cps (zh 9, ja 4, ko 12) | no | capcut-cli |
| cue-too-long | warning | caption on screen longer than 7 s | yes (split) | capcut-cli |
| caption-too-short | warning | under 0.8 s; never auto-shrink below 100 ms | no | recommendation / capcut-cli floor |
| caption-outside-safe-area | warning | on a vertical canvas, `|y|` beyond 0.85 | no | capcut-cli |
| loudness-off-target | warning | integrated loudness more than ±1 LU from −14 | yes (loudnorm) | recommendation |
| true-peak / clipped-samples | warning | true peak above −1 dBTP, or any clipped sample | yes (limiter) | recommendation |
| music-not-ducked | warning | voice-to-music margin under 12 dB during speech | yes (duck op) | recommendation |
| vfr-media | info | variable frame-rate source; transcode to CFR first | no | capcut-cli |
| unresolved-review-marker | info (blocks export) | a marker is still in `review` | human | palmier |
| tiny-keep-fragment | info | auto-cut left a piece shorter than 0.3 s | no | recommendation |

The gate uses exit codes 0, 1 and 2 for clean, warnings and errors, as capcut-cli does. Each issue carries `{severity, code, message, fixable, suggestedOp, location}`. Auto-fixes run only when they cannot delete or retime user content.

---

## 8. Interchange and CapCut draft cautions

**FCPXML (Resolve/FCP)**

- Version 1.10 is accepted by Resolve 18 and later.
- **Carries:** placement and trims; speed as a `timeMap`; lane order; text with font and stroke; position, scale and rotation, including their keyframes; static crop; opacity, including keyframes; static volume; source timecode.
- **Drops:** keyframed volume; audio fades; crop keyframes; text boxes; colour and effects.
- Resolve reads position and crop in different units from FCP, so emit per target.
- Negate rotations: FCP treats counter-clockwise as positive.

**XMEML (Premiere)**

- **Carries:** placement and trims; speed (Time Remap); static and keyframed volume, opacity, motion and crop; fades as one-sided dissolves; links; nested sequences.
- **Drops:** text; flips; keyframe easing; effects.

**Other formats**

- **OTIO** (capcut-cli): speed becomes a `LinearTimeWarp`; captions can travel as Stack markers. Every skipped track is reported.
- **CMX3600 EDL:** each event has eight fields — event, reel, track, transition, source in, source out, record in, record out.
- **CSV / TSV:** `start,end,label` in seconds (lossless-cut).
- **YouTube chapters:** the first chapter is at `0:00`.
- **MP4 chapters** must be contiguous, so insert gap chapters (lossless-cut).

**CapCut drafts** (from capcut-cli's pitfalls and version notes; a draft is a hand-off, never the master)

- **Timing:** microseconds; `source = target × speed`, and the speed material must agree.
- **Main track** is magnetic: gaps close when the project opens.
- **Source ranges** past the media make the clip play from 0.
- **Effects:** alpha keyframes do not render (use animation materials); audio segments have `clip = null`; text style ranges are UTF-16 code units.
- **Storage:** 8.7+ adds mirror files; 9.2+ uses a nested `Timelines/<id>/` document; JianYing 6+ is encrypted; CapCut 10.x reportedly rejects tool-written drafts.
- **Safe writing:** close the app; write atomically with an mtime conflict check; keep `.bak` plus snapshots; verify visually.

---

## 9. Implementation recommendations (Node, zero dependencies, FFmpeg only)

1. **Storage.**
   - SQLite tables: `timelines`, `revisions` (append-only: content JSON, ops JSON, receipt JSON, lint JSON, actor, parent) and `assets` (probe JSON, durationUs, fps, CFR flag, analysis refs).
   - Keep separate analysis caches keyed by asset id plus size and mtime: VAD masks, word transcripts, beats, scene cuts.
2. **Pure core.** One module of pure functions: `plan(op, timeline) → {actions | refusal}`, `apply(actions) → timeline`, `diff(before, after) → receipt`, and `lint(timeline, assets) → issues`. The UI, the agent tool layer and tests all call these. Port the overwrite and ripple engines described in skills `overwrite-placement` and `ripple-delete-ranges`.
3. **Analysis via FFmpeg pipes.**
   - Spawn ffmpeg with `-f s16le` or `-f f32le` to stdout and compute RMS, VAD, spectral flux and onsets in Node.
   - Parse `silencedetect`, `blackdetect`, `freezedetect` and `metadata=print` output line by line.
   - Use whisper.cpp (or similar), shelled out, for word timestamps.
   - If no neural VAD is available, an energy plus zero-crossing VAD with the adaptive −12 dB rule in section 5.1 is a good stand-in.
4. **Renderer.**
   - A pure `buildFilterGraph(timeline, assets, {scale, preset}) → args` writes a `-filter_complex_script` file.
   - Previews: proxy scale 0.5 with `ultrafast`. Finals: full resolution with two-pass loudnorm.
   - Normalize every branch with fps, scale, pad, setsar, format and settb before `concat`/`xfade`.
   - Unit-test the graph strings without running ffmpeg, as capcut-cli does.
5. **Agent layer.**
   - About 30 intent-level tools mirroring section 4.
   - Compact reads: omit defaults, summarize caption groups, list gaps.
   - Receipts as specified in section 3.
   - Markers as the review channel.
   - Generative ops always pause for a human.
6. **Gates.**
   - Lint after every revision, stored with it.
   - Export requires zero errors, no `review` markers and a loudness pass.
   - Attach verification stills (grid plus frame number) and the transcript diff to every agent revision a human reviews.
7. **Normalize sources.** Transcode VFR phone footage to CFR at the project rate before editing. Every frame-exact rule above assumes constant frame rate.

**Generative add-ons (brief)**

- palmier treats generation as new assets plus swaps, behind a cost gate. A localized video-to-video edit runs on the clip's trimmed range and replaces its media on completion, keeping the edit. A gap of up to 15 s becomes a first/last-frame transition from captured frames.
- open-higgsfield's catalogue uses the same roles: start/end frame, references, an "Edit" model (one video in) and an "Extend" model (4–30 s).
- Omni-Video 2 is a research text-to-video / video-to-video model (default 832×480, 41 frames, 8 fps). Treat it as an offline asset generator, not a timeline primitive.
