# TubeMind (0.97)

Owner, 2026-11-10: "instead of NexLev I have TubeMind; add the TubeMind setup in Connections."

## What TubeMind is

[TubeMind](https://tubemind.io) is a YouTube research service run by Microserp Technologies FZC LLC (Sharjah). It keeps its own index of channels and videos and offers:

- outlier videos (a video's views against its channel's usual views, for example 5x),
- niche reports with an "Enter now · Wait · Avoid" verdict and the evidence behind it,
- channel research (stats, RPM and revenue estimates, multipliers), similar channels and young channels already getting views.

Its numbers are TubeMind's estimates (revenue is a range by niche and country, not real earnings). TubeMind uses YouTube API Services, keeps statistics for up to 30 days, and asks users to agree to YouTube's Terms of Service.

## How a program connects

AI apps reach TubeMind through a private **connector URL**: on tubemind.io open **Connect AI**, click **Create connector URL** and copy the address it shows once. The key is inside the URL, so it is a password. TubeMind speaks MCP over Streamable HTTP and offers eight tools: Explore niches, Niche reports, Search channels, Channel research, Find outliers, Similar channels, Compare channels and New channels. Up to 25 keys can be active; changing your TubeMind password turns them all off.

TubeMind has not published how a bare API key is used on its own (the "pull path"), so the program takes the connector URL.

**Paused today.** TubeMind's docs (updated 2026-11-06) say connector and API-key data is paused while YouTube reviews TubeMind's API use: a connected app gets a short "paused" message instead of research. The program reports that plainly. The connection itself works, and research flows when TubeMind resumes it.

## In the program

- **Connections → TubeMind** (`connectors.js` provider `tubemind`): paste the connector URL. It must be https on tubemind.io (`tubemind.js` `connectorUrl`), is kept encrypted like an API key (DPAPI on Windows), never shown again and never put into an error message. The test opens an MCP session, lists the tools with their fields and asks for one list of niches (needing no fields) to see whether TubeMind gives research today; the card names the tools and says "paused" when TubeMind does.
- **Niche Factory → TubeMind research** (`niche-factory.js` `runTubemind`, `POST /api/tubemind/run`): each of TubeMind's tools is a button; its window is built from the tool's own fields (`checkArgs`: required fields, numbers, choices, no unknown fields). One click is one request, never retried by itself. Results are kept 30 days (`tubemind_reads`, purged like TubeMind's own statistics) and show what was asked and what TubeMind returned.
- **Evidence**: results with research in them are used as evidence for "Niches the program suggests" while ticked (`suggestionEvidence` kind `tubemind research`); "Use as evidence (stop)" or Remove takes one out (`POST /api/tubemind/reads/:id`).

## Not yet

NexLev stays where it is (discovery, rising channels, proven demand in Trending topics, the competitor watch). Replacing it there needs TubeMind's real answers, which cannot be read while its data is paused: once TubeMind resumes, its tools' answers can be studied and mapped into discovery and demand.
