from pathlib import Path
import re, json
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'/'YouTube_Automation_Program_Blueprint.pdf'
OUT.parent.mkdir(exist_ok=True)
FONT=Path('C:/Windows/Fonts')
for name,file in [('Body','calibri.ttf'),('Bold','calibrib.ttf'),('Light','calibril.ttf'),('Italic','calibrii.ttf'),('Mono','consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(FONT/file)))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Italic',boldItalic='Bold')
NAVY=colors.HexColor('#112D3A'); TEAL=colors.HexColor('#087E8B'); ORANGE=colors.HexColor('#D86A35'); INK=colors.HexColor('#223743'); MUTED=colors.HexColor('#566A73'); PALE=colors.HexColor('#EFF5F5'); LINE=colors.HexColor('#D7E2E4')
W,H=595.276,841.89
CW=W-88
styles={
 'body':ParagraphStyle('body',fontName='Body',fontSize=10.5,leading=14.3,textColor=INK,spaceAfter=8),
 'small':ParagraphStyle('small',fontName='Body',fontSize=8.8,leading=11.8,textColor=MUTED,spaceAfter=6),
 'h2':ParagraphStyle('h2',fontName='Bold',fontSize=13,leading=16,textColor=NAVY,spaceBefore=9,spaceAfter=6),
 'title':ParagraphStyle('title',fontName='Light',fontSize=27,leading=30,textColor=NAVY,spaceAfter=12),
 'deck':ParagraphStyle('deck',fontName='Body',fontSize=12,leading=16,textColor=MUTED,spaceAfter=14),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=9.2,leading=12,textColor=INK),
 'headcell':ParagraphStyle('headcell',fontName='Bold',fontSize=9.2,leading=12,textColor=colors.white),
 'callout':ParagraphStyle('callout',fontName='Bold',fontSize=11,leading=15,textColor=NAVY),
 'ref':ParagraphStyle('ref',fontName='Body',fontSize=9.5,leading=13,textColor=INK,spaceAfter=10),
}
story=[]; sections=[]
def p(s,style='body'): return Paragraph(s,styles[style])
def add(s,style='body'): story.append(p(s,style))
def h(s): add(s,'h2')
def bullets(items):
    for item in items: add('<font color="#087E8B">•</font> '+item)
def table(head,rows,widths=None):
    data=[[p(x,'headcell') for x in head]]+[[p(str(x),'cell') for x in row] for row in rows]
    t=Table(data,colWidths=[CW*x for x in widths] if widths else None,hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,colors.white]),('LINEBELOW',(0,0),(-1,0),.6,NAVY),('LINEBELOW',(0,1),(-1,-1),.35,LINE)]))
    story.extend([t,Spacer(1,8)])
def call(s):
    t=Table([[p(s,'callout')]],colWidths=[CW]); t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.6,LINE),('LINEBEFORE',(0,0),(0,0),3,TEAL),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),11)]));story.extend([t,Spacer(1,10)])
def page(num,kicker,title,deck=''):
    if story: story.append(PageBreak())
    sections.append((num,title))
    add(f'{num:02d}  /  {kicker.upper()}','small');add(title,'title')
    if deck:add(deck,'deck')

class Diagram(Flowable):
    def __init__(self,kind,height): Flowable.__init__(self);self.kind=kind;self.width=CW;self.height=height
    def draw(self):
        c=self.canv
        def box(x,y,w,hh,title,sub='',fill=PALE):
            c.setFillColor(fill);c.setStrokeColor(LINE);c.roundRect(x,y,w,hh,7,fill=1,stroke=1)
            c.setFillColor(NAVY);c.setFont('Bold',10);c.drawString(x+12,y+hh-20,title)
            c.setFillColor(MUTED);c.setFont('Body',8.5)
            for i,txt in enumerate(sub.split('|')):c.drawString(x+12,y+hh-35-i*11,txt)
        def arrow(x1,y1,x2,y2):
            c.setStrokeColor(TEAL);c.setLineWidth(1.2);c.line(x1,y1,x2,y2)
            if y2<y1:c.line(x2,y2,x2-3,y2+5);c.line(x2,y2,x2+3,y2+5)
            else:c.line(x2,y2,x2-5,y2-3);c.line(x2,y2,x2-5,y2+3)
        if self.kind=='arch':
            box(0,284,CW,55,'CONTROL ROOM','Audience • channel families • calendar • reviews • costs')
            arrow(CW/2,284,CW/2,269)
            box(0,204,CW,65,'WORKFLOW MANAGER + SAVED JOBS','Validates inputs, reserves budget, assigns work, saves results|The language model proposes; application rules authorize each action.')
            arrow(90,204,90,187);arrow(254,204,254,187);arrow(420,204,420,187)
            box(0,107,158,80,'RESEARCH + WRITING','Approved sources|LLM and vision tools|Evidence / script / scene plan')
            box(173,107,158,80,'MEDIA PRODUCTION','Voice and translation|Assets and FFmpeg|Three checked editions')
            box(346,107,161,80,'PUBLISH + MEASURE','YouTube OAuth|Schedule / reconcile|Authorized analytics')
            arrow(90,107,90,88);arrow(254,107,254,88);arrow(420,107,420,88)
            box(0,15,CW,73,'SHARED RECORDS, ISOLATED CHANNEL ACCESS','Database: versions, source permissions, job state, spend and audit trail|Media storage: visual master, audio stems, localized assets and final renders|Secrets: protected separately; never included in model prompts')
        elif self.kind=='family':
            box(115,139,277,60,'ONE ORIGINAL CONTENT MASTER','Approved story + reusable visual timeline')
            c.setStrokeColor(TEAL);c.setLineWidth(1.2);c.line(254,139,254,129);c.line(80,129,426,129)
            for x,title,sub in [(0,'ENGLISH','Narration + EN packaging'),(173,'SPANISH','Adapted narration + ES packaging'),(346,'ITALIAN','Adapted narration + IT packaging')]:
                arrow(x+80,129,x+80,117);box(x,34,161,83,title,sub+'|Language QA and schedule|Separate YouTube channel')
        elif self.kind=='ui':
            c.setFillColor(NAVY);c.roundRect(0,0,CW,298,9,fill=1,stroke=0)
            c.setFillColor(colors.white);c.setFont('Bold',11);c.drawString(14,276,'CHANNEL CONTROL ROOM')
            c.setFont('Body',8);c.drawRightString(CW-14,276,'Family: Everyday Systems     EN / ES / IT')
            for i,lab in enumerate(['Overview','Opportunities','Script studio','Production','Calendar','Analytics','Connections']):
                c.setFillColor(colors.HexColor('#224553') if i==0 else NAVY);c.roundRect(8,233-i*29,100,24,4,fill=1,stroke=0)
                c.setFillColor(colors.white);c.setFont('Body',9);c.drawString(16,241-i*29,lab)
            box(121,202,116,55,'6 READY','Today’s production')
            box(246,202,116,55,'2 NEED REVIEW','Language / source issue')
            box(371,202,122,55,'$42 / $60','Daily budget used')
            box(121,76,372,114,'TODAY’S QUEUE','EN  -  Kitchen design story       Ready to schedule|ES  -  Kitchen design story       Narration too long|IT   -  Kitchen design story       Rendering, scene 4 of 8|EN  -  Tomorrow’s topic            Evidence ready')
            box(121,13,372,51,'NEXT ACTION','Review Spanish scene 3  •  Preview / revise / retry scene')
        elif self.kind=='roadmap':
            for i,(t,s) in enumerate([('DAYS 1-30','Prove one English video'),('DAYS 31-50','Add languages and daily planning'),('DAYS 51-70','Harden operations and add analytics'),('DAYS 71-100','Expand only after gates pass')]):
                box(0,183-i*56,CW,48,t,s)

page(1,'Product and engineering blueprint','YouTube\nautomation program'.replace('\n','<br/>'),'A practical plan for original content, three languages and a portfolio of 10-15 channel families.')
story.append(Spacer(1,12))
call('Build one dependable production loop. Prove audience value. Then repeat it across English, Spanish and Italian.')
story.append(Diagram('family',220))
table(['TARGET','DESIGN COMMITMENT'],[
 ('10-15 original brands','30-45 separate language channels, grouped into families.'),
 ('Research to publishing','Evidence-led topics, scripts, expressive narration, editing, scheduling and learning.'),
 ('90-100 day ambition','A measurable validation window, never a promise of ranking, revenue or monetization.')],[.30,.70])
add('Prepared for your project • 7 September 2026 • Version 1.0','small')
add('Basis: your written request, six supplied screenshots, selected source files from three public GitHub repositories, and current primary platform documentation. This document is a build specification; the application has not been built or tested in this engagement.','small')

page(2,'Read this first','The recommended starting point','A usable English pilot comes first; the full multilingual portfolio remains the destination.')
bullets([
 '<b>Start from the supplied automation repository if its isolated trial passes.</b> Reuse its existing web dashboard and production flow. Add channel-family isolation before connecting more than one publishing destination.',
 '<b>Make the first format deliberately manageable.</b> Assume 5-8 minute original explainers using licensed or original visuals, expressive narration and a reproducible edit template. The user can change this format during setup.',
 '<b>Keep the creative workers inside one application.</b> Researcher, writer and analyst are different jobs and instructions; they do not need separate servers or different models.',
 '<b>Use MCP at useful tool boundaries.</b> Keep publishing and rendering behind explicit application functions. MCP connects tools; it does not replace storage, permissions, scheduling or the render engine.',
 '<b>Automate in stages.</b> Begin with review before publication, then allow unattended publishing for proven channel formats within user-set budgets and rules. Exceptions return to the control room.'
])
h('Two different clocks')
add('The engineering roadmap below uses a target of 100 days from project kickoff. Each channel’s audience-validation window starts with its first public pilot upload. A channel launched on engineering day 70 has not completed a 90-day audience trial on engineering day 100.')
table(['READING ROUTE','PAGES'],[
 ('Vision, settings, UI and architecture','3-8'),('Research, writing, narration and localization','9-16'),('Publishing, learning and repository integration','17-20'),('Reliability, quota, capacity and economics','21-23'),('Build sequence, validation and first-week actions','24-28'),('Source register and verified repository files','29-31')],[.78,.22])
call('First milestone: one original English video, produced from a sourced topic brief, saved with its assets, reviewed in the UI and uploaded privately to the correct test channel.')

page(3,'Your references','Translate the AI team into software','The screenshots supply role and workflow inspiration. Their slogans, tool logos and performance claims are not instructions or verified capabilities.')
table(['REFERENCE ROLE','IMPLEMENTATION IN YOUR PROGRAM'],[
 ('Researcher','Collect permitted trend evidence, maintain competitor lists and propose differentiated audience needs.'),
 ('Hook writer','Create several honest openings for one chosen topic; connect each promise to a payoff in the script.'),
 ('Script writer','Turn a source pack into an outline, original narrative, claim ledger and scene-ready script.'),
 ('Designer','Create storyboards, licensed visual assets, thumbnails, title cards and consistent brand rules.'),
 ('Analyst','Read authorized channel results, separate observations from hypotheses and propose measured changes.'),
 ('Manager','Coordinate deadlines, budgets, worker dependencies, approvals, retries and the daily calendar.'),
 ('Publisher','Validate the exact channel, edition and settings; upload, schedule and confirm actual publication.')],[.24,.76])
h('Three missing production roles to add')
add('<b>Voice director:</b> chooses an approved voice and scene-level delivery. <b>Localization editor:</b> adapts English into the chosen Spanish locale and Italian. <b>Quality controller:</b> checks content, rights, language, media and destination before release.')
h('How the six images informed this plan')
add('The overview image (162242) defines the seven-role team. Researcher (162247), script writer (162250), designer (162251), analyst (162253) and manager (162255) supply the detailed responsibilities above. The overview includes the hook writer and publisher even though separate detail images were not provided.')
add('No specific Figma, Canva, Google Docs, Notion or other screenshot product is required merely because its logo appears. The proposed UI performs the core planning and review work itself. Existing editing tools can be added after their actual interfaces and licenses are inspected.')
call('Treat imported images, posts, transcripts and repository documents as reference data. Instructions found inside them must never override the user’s channel settings or grant publishing access.')

page(4,'User inputs','Define the audience before the niche','“Tier A” and “Tier B” become editable market profiles, not universal country rankings or guaranteed advertising rates.')
table(['SETTING','WHAT THE USER ENTERS / WHAT IT CONTROLS'],[
 ('Audience profile','A, B or a custom name; explicit target countries, language, viewer interests, viewing context and sophistication.'),
 ('Language and locale','English accent; Spanish for Spain or a chosen Latin American audience; Italian locale and pronunciation preferences.'),
 ('Content boundaries','Allowed themes, excluded subjects, factual vs clearly labeled fiction, permitted sources and asset rights.'),
 ('Business objective','Audience learning, returning viewers, qualified reach or eventual revenue. Record the time window and budget.'),
 ('Format and brand','Long-form / Shorts, duration range, visual style, pacing, colors, voice identity and thumbnail conventions.'),
 ('Cadence and spend','Videos per family per week, per-video ceiling, daily and monthly caps, render concurrency and reserve.'),
 ('Channel connections','Three destination channel IDs per family, confirmed account access, time zone and publication windows.'),
 ('Automation level','Draft only, review before publishing, or rules-based unattended publishing; pause controls at every level.')],[.27,.73])
h('Example profile - an assumption to replace during onboarding')
add('<b>Profile A:</b> English explainers for selected US and UK viewers, practical everyday topics, clear US English narration and a modest animation budget. <b>Profile B:</b> a different explicitly selected market and cost ceiling. Neither profile asserts audience quality, purchasing power or expected RPM.')
add('Spanish and Italian are independent editorial markets. An English topic does not automatically have equal demand in both. Keep a shared story where it travels well and allow a language edition to be postponed when it does not.')
call('The program can influence audience fit through subject, language, examples and packaging. It cannot force YouTube’s recommendation system to deliver a specified country mix.')

page(5,'Control room','A UI built around daily decisions','Show the user what is ready, what needs attention, what will publish and what it costs.')
story.append(Diagram('ui',314))
add('Illustrative UI concept. All names, counts and dollar values above are fictional.','small')
table(['SCREEN','PRIMARY ACTION'],[
 ('Opportunities','Compare source-backed niche and topic briefs; choose a differentiated angle.'),
 ('Script studio','Review outline, hooks, evidence and scene delivery; edit and lock the approved version.'),
 ('Production studio','Preview scenes and EN/ES/IT editions; replace an asset or retry only the failed scene.'),
 ('Calendar + analytics','See destination-local schedules, confirmed uploads, delayed measurements and experiment results.'),
 ('Connections + costs','Check account authorization, tool availability, quota buckets, spend limits and failures.')],[.30,.70])
add('Every review item shows a concrete reason: “source permission missing,” “Spanish scene 3 exceeds its slot” or “channel access expired.” Include approve, revise, retry and pause actions. Keyboard access, readable contrast and a full-screen preview belong in the first release.')

page(6,'System architecture','One application, specialized workers','Begin with the existing Node.js web application, a database and a separate media worker. Add infrastructure when measured load requires it.')
story.append(Diagram('arch',355))
h('Initial deployment')
add('Run the dashboard and manager on one controlled machine. Keep SQLite on local disk for the single-host pilot; use saved jobs rather than relying only on an in-memory timer. Render through a separate process so a long video does not freeze the dashboard. The manager must be running for job dispatch, while an accepted YouTube schedule can publish independently.')
h('Production deployment')
add('Use an always-on server or VM for reliable daily operation. Keep media on durable storage and encrypted backups. Move to PostgreSQL before adding multiple job-writing hosts or if SQLite locking becomes a measured constraint. Add a shared queue only when saved database jobs no longer meet throughput and recovery needs.')
add('The current repository already uses Express, SQLite and FFmpeg-related components [R2]. MCP provides a standardized host/client/server tool connection [S13]. The arrangement above is a proposed design, not a capability verified by running the repository.')

page(7,'Worker contracts','Give each worker one clear output','A “worker” is a bounded task with a saved result, not an unlimited conversation among agents.')
table(['WORKER','INPUT → SAVED OUTPUT','PASS CONDITION'],[
 ('Manager','Profile + calendar → jobs and reservations','Dependencies and budget are valid.'),
 ('Researcher','Market + permitted sources → evidence pack','Links, dates and access status present.'),
 ('Strategist','Evidence + brand → niche / topic brief','Distinct audience need and testable angle.'),
 ('Hook + script writer','Approved brief → outline and scene script','Promise pays off; claims are traceable.'),
 ('Visual director','Scene script → storyboard and asset list','Original, producible and properly licensed.'),
 ('Voice director','Text + delivery cues → narration stems','Correct words, accent and pronunciation.'),
 ('Localization editor','Locked English → ES and IT scene editions','Meaning, timing and local language pass.'),
 ('Editor + QC','Manifest + assets → validated video files','Media, editorial and language checks pass.'),
 ('Publisher','Approved edition → upload and schedule record','Correct channel and confirmed video ID.'),
 ('Analyst','Available reports + experiment → findings','Measured result distinguished from guess.')],[.23,.45,.32])
h('Common contract')
add('Each result carries: job ID, family ID, language, input version, source references, structured payload, warnings, model/provider identity, spend, timestamps and output file hashes. Validate required fields in application code. A model response saying “approved” cannot advance an approval state.')
add('Retry a recoverable task at most twice initially. Schema repair gets one targeted attempt. After that, retain the failed output and show the reason. Successful upstream work remains reusable. Separate reviews can use a second model where measured quality improves enough to justify the cost.')
call('Use ordinary functions for fixed actions. Use an LLM for interpretation, writing and judgment. Use a vision-capable model only when permitted visual material must actually be inspected.')

page(8,'Data and versions','The content family is the central record','One idea can produce three editions without losing the relationship between scripts, assets, costs and YouTube uploads.')
table(['RECORD','ESSENTIAL FIELDS'],[
 ('Family + channel','family_id, brand/profile version; channel_id, language, locale, time zone, secret reference.'),
 ('Source + evidence','source_id, URL, retrieval time, allowed use, rights evidence, expiry, claim links and permitted excerpts.'),
 ('Content master','content_id, family_id, topic, angle, script version, approval state, source pack and target length.'),
 ('Scene','scene_id, order, narration, visual instructions, duration target, asset IDs and pronunciation cues.'),
 ('Edition','content_id + language + version, localized script, audio, captions, timeline, QC results and metadata.'),
 ('Job + cost','stage, input hash, lease, attempts, provider job ID, reserved/actual cost, files, next retry and error.'),
 ('Publication','edition_id, channel_id, upload attempt/session, YouTube ID, target time, actual status and reconciliation.'),
 ('Measurement + experiment','source report, availability date, metric definition, observation window, treatment, decision and permission mode.')],[.28,.72])
h('Rules that prevent expensive mistakes')
bullets([
 'Require the family and channel on every protected operation. Enforce a unique edition/destination/version publication record and a unique stage/input-hash job record.',
 'Lock the English script before translation. Editing an upstream claim invalidates affected translations, narration, captions and approvals; unchanged scenes keep their assets.',
 'Version prompts and model settings alongside the result. Store secrets elsewhere; database rows contain references, never raw credentials in text sent to an LLM.',
 'Give source-derived records refresh/delete dates. Propagate deletion to excerpts, indexes and cached analyses as required by the relevant source agreement [S9, S10].'
])
add('Media layout: family / content / version / shared, en, es, it. Shared stores licensed visual sources and the music/effects bed; each language stores its narration, captions, metadata and final render. Backups include the manifest needed to reconstruct the project.')

page(9,'Data reality','What the connectors can actually know','Competitor observation and your own channel analytics are different data products.')
table(['NEED','AVAILABLE ROUTE','LIMITATION / FALLBACK'],[
 ('Competitor videos','YouTube Data API: channels, uploads playlists, videos and permitted comments','Public metadata and exposed counts; missing values stay unknown.'),
 ('Audience country','Your authorized Analytics reports','Competitor audience geography is private. Region search is not audience proof.'),
 ('CTR and retention','Authorized reports where supported; owner-provided Studio export if needed','No competitor CTR or retention. Confirm report/metric compatibility.'),
 ('Competitor scripts','Permissioned transcripts, licensed material or permitted editorial notes','Official caption download requires edit permission; no universal transcript API.'),
 ('Reddit stories','An approved access/use agreement or user-provided material with usable rights','Reddit access and commercial use need validation; public visibility is not a reuse license.'),
 ('Visual inspection','Permitted thumbnails, supplied assets or authorized footage + vision model','A text search tool does not watch or understand every video.'),
 ('Trend signal','Approved search/news/RSS sources with dates and local relevance','Coverage varies. Use multiple independent sources and show freshness.')],[.23,.34,.43])
add('YouTube Analytics and Reporting data require authorization from the relevant owner [S4]. Caption downloads require permission to edit the video [S5]. Search region and language parameters do not establish who watched the resulting videos [S3].')
h('Make access visible in the UI')
add('Use statuses such as verified, available with limits, awaiting access and unavailable. A connector health check must make a small permitted read, record the time and distinguish installed software from working credentials. A blocked Reddit connector must not stop original content production from other approved sources [S10].')
call('Never fill a missing metric with an invented number. Display “unavailable,” the reason and the last successful refresh.')

page(10,'Niche discovery','Select a repeatable audience opportunity','The niche engine should produce a shortlist with reasons, counterevidence and a test plan, not a “guaranteed viral” label.')
h('Discovery process')
add('1. Convert the market profile into 10-20 audience problems and interests. 2. Gather recent, relevant evidence from allowed sources. 3. Review several channels and formats, including ordinary performers. 4. Identify gaps where original expertise, explanation or storytelling adds value. 5. Test production feasibility and at least 20 distinct future episode ideas. 6. Return three niche proposals, including reasons to reject each.')
table(['PROPOSED RUBRIC','WEIGHT','EVIDENCE'],[
 ('Audience problem and demand','25%','Fresh permitted demand evidence and repeated viewer questions.'),
 ('Creative differentiation','25%','A specific missing explanation, perspective or narrative approach.'),
 ('Repeatable episode supply','20%','Twenty materially different topics, not superficial rewrites.'),
 ('Production feasibility','15%','A sample storyboard that meets budget and editing constraints.'),
 ('Language-market fit','15%','Local relevance, source availability and natural adaptation.')],[.36,.14,.50])
add('Proposed score = sum(weight × rubric rating / 5), expressed on a 0-100 scale. It is a decision aid, not a calibrated probability. Example ratings 4, 4, 5, 3, 4 yield 81/100. This example is fictional; no niche has been researched and selected for your actual channels here.')
h('Two operating modes')
add('<b>Before YouTube analytics permission:</b> show raw YouTube results separately. Compute the rubric only from permitted non-YouTube evidence and original editorial inputs; do not feed API data into custom scores, automated sentiment or derived classifications. <b>After the relevant approval:</b> enable the specifically accepted analytics use cases and clearly label your own scores [S9, S9a].')
call('Hard filters come before ranking: insufficient rights, weak evidence, unsuitable content, unworkable costs or no meaningful originality means “do not produce,” regardless of the score.')

page(11,'Competitor research','Find an opportunity without copying','The strongest output is a better content hypothesis supported by visible evidence.')
h('Build a comparable observation set')
add('Start with roughly 5-10 relevant channels per candidate niche and a bounded set of recent videos. Include smaller channels and weak or average videos, not just viral successes. Separate Shorts from long-form, compare similar durations and upload ages, and record language, topic and source dates. This is a proposed sampling plan; coverage and permissions may reduce it.')
table(['OBSERVE','ASK','CREATE SOMETHING DISTINCT'],[
 ('Title and opening','What specific promise makes this relevant?','A new question and payoff for the chosen audience.'),
 ('Narrative structure','Where does the explanation become unclear?','A clearer sequence, original example or visual demonstration.'),
 ('Evidence and omissions','What is asserted without support or left unanswered?','Add traceable sources, limitations and useful missing detail.'),
 ('Visual and voice design','Does the execution support the story?','Choose a coherent visual metaphor and intentional delivery.'),
 ('Permitted feedback','What questions recur? Is feedback representative?','Address a real need; do not assume commenters represent all viewers.')],[.27,.35,.38])
h('Optional quantitative analysis - approved mode only')
add('If accepted under YouTube’s additional analytics terms, calculate view change between time-stamped snapshots and an outperformance ratio against age-, language- and format-matched videos. Store sample size, exclusions and uncertainty. Use comparable measurement ages; never compare one-day views directly with year-old totals. The formulas and labels must match the approved use case [S9a].')
h('Report observations and hypotheses separately')
add('<b>Observation:</b> a video opens with a concrete demonstration. <b>Hypothesis:</b> the demonstration may reduce early confusion. <b>Test:</b> compare your own demonstration-first and explanation-first episodes with similar audiences and lengths. Private retention, traffic source and recommendation decisions remain unknown for competitors.')
add('Do not duplicate wording, personal stories, distinctive visuals or a creator’s identity. Study an abstract technique, then produce your own facts, examples and expression. A transcript is research input only when its acquisition and use are permitted.')

page(12,'Daily research','Every proposed topic gets an evidence brief','The queue should be refreshed daily; publication cadence remains a configurable editorial and budget decision.')
h('Daily manager sequence')
add('Refresh connector health and permitted evidence. Review the backlog and recent channel results. Generate a small candidate set, remove repeats and weak sourcing, then produce up to three briefs for each family with an open calendar slot. Reserve research and production spend before making paid calls. Return “no strong topic today” when the evidence is poor.')
table(['BRIEF FIELD','REQUIRED CONTENT'],[
 ('Audience + why now','Market, viewer problem, evidence date and freshness window.'),
 ('Sources + confidence','Direct URLs, claim references, permissions, agreement between sources and missing evidence.'),
 ('Competitor gap','Concrete observation, interpretation and an original contribution.'),
 ('Creative package','Working title, three hook choices, story outline, proof and payoff.'),
 ('Production plan','Estimated length, required assets, voice style, cost ceiling and render complexity.'),
 ('Localization check','Why the topic works in EN/ES/IT; local terms, examples and edition-specific concerns.'),
 ('Experiment + expiry','One hypothesis, observation window, decision rule and when the brief becomes stale.')],[.29,.71])
h('Illustrative brief - not a verified trend')
add('<b>Topic:</b> Why an organized kitchen can still feel slow. <b>Original angle:</b> follow one cooking task through a simple animated floor plan and show the extra steps. <b>Hook:</b> “Every item has its place, but making dinner still takes too many trips.” <b>Payoff:</b> demonstrate three layouts with different tradeoffs. <b>Required evidence:</b> licensed or original layout examples and reliable design sources. <b>Language check:</b> adapt appliance names and measurement units.')
add('A real brief must supply actual source links before approval. Avoid presenting a Reddit anecdote as a proven fact. When a story is original fiction, label it appropriately and keep it separate from factual reporting.')
call('Source access is a dependency, not the product’s only brain. If Reddit is unavailable, use approved sources, original reporting and the creator’s own experience.')

page(13,'Writing','Build the hook and its payoff together','Scripts should be compelling because they are clear, specific and worth watching.')
h('The writing pipeline')
add('Research pack → claim ledger → outline → three hook alternatives → original script → editorial review → scene segmentation → locked English master. Review before spending on voice and video generation.')
table(['PART','WRITING REQUIREMENT'],[
 ('Opening','Give a concrete tension, question or promised result. Avoid a long generic introduction.'),
 ('Progression','Introduce a meaningful new point or consequence as the story develops; use pacing appropriate to the format.'),
 ('Proof','Link factual claims to source IDs. Distinguish estimates, examples, personal accounts and fiction.'),
 ('Payoff','Resolve the central promise. Do not keep opening curiosity gaps that never close.'),
 ('Ending','Summarize the useful takeaway and use a relevant, modest call to action.'),
 ('Scene directions','Separate spoken words from visual instructions, pauses, emphasis and on-screen text.')],[.23,.77])
h('The review rubric')
bullets([
 '<b>Originality:</b> new expression, structure and contribution; a similarity flag triggers editorial review rather than a claim that copyright has been “cleared.”',
 '<b>Truth:</b> no invented quotes, sources, dates or statistics. A second model can flag problems, but cannot substitute for source verification.',
 '<b>Delivery:</b> read the script aloud; remove unnatural sentences and ambiguous pronunciation before synthesis.',
 '<b>Promise alignment:</b> the title, thumbnail, first scene and actual conclusion must agree.'
])
add('For the assumed 5-8 minute pilot, use roughly 650-1,100 English words as an initial drafting range, then measure the actual narration. Do not treat a word count as a guaranteed duration. Save a pronunciation glossary for names, technical words and recurring characters.')
call('One approved script version is the translation source. Corrections to facts must flow into every affected language edition before publication.')

page(14,'Voice production','Direct the voice like a performance','Tone, accent, pacing and emotional intent belong in the scene plan, not in a random voice selection.')
table(['VOICE PROFILE','EXAMPLE INPUT'],[
 ('Identity','Approved provider voice ID, commercial usage rights and recorded consent if a real person’s voice is cloned.'),
 ('Locale + accent','Selected English accent; Spanish regional variety; Italian. Keep audience locale distinct from UI language.'),
 ('Delivery','Warm explanatory narrator; curious opening; slower technical details; restrained emphasis at the payoff.'),
 ('Pronunciation','Name glossary, abbreviations, numbers and pronunciation overrides supported by the provider.'),
 ('Timing','Scene word budget, intentional pauses and target duration; final timing comes from generated audio.'),
 ('Continuity','Pinned voice and settings across scenes; consistent character identity across the channel.')],[.28,.72])
h('Choose providers by audition, not claims')
add('Run a small, paid-if-required comparison using the same 30-60 second passage in each language. Include emotion, a name, a number and a tricky sentence. Rate naturalness, intelligibility, accent fit, timing control, supported commercial use and cost. Select one primary provider and one tested fallback. Exact providers and model versions remain procurement decisions.')
h('Generate and check')
add('Synthesize scene-level narration. Save the raw lossless audio and settings. Transcribe the output to detect omissions or extra words; use the expected script and pronunciation glossary during review. Check clipping, unexplained silence, abrupt joins and inconsistent loudness. Automated transcription is a detector, not proof of a natural accent.')
add('Use provider-supported expressive instructions or SSML only when that engine supports them. Keep performance cues out of spoken text. Maintain background music and effects as separate stems, then mix after each language narration is approved.')
call('A voice-only language replacement is practical when the visual master is designed for it. Long translated lines must be rewritten or retimed, not forced into unnaturally fast speech.')

page(15,'Editing and rendering','Build a reusable visual master','Start with one reliable editing path. Plug in the user’s additional open-source editors after testing their actual automation interfaces.')
h('Core production sequence')
add('Convert the scene script into a manifest. Resolve licensed/original assets. Generate only the visuals that are needed. Assemble a narration-free timeline with separate text layers, music and effects. Add the selected narration and captions. Render, decode and inspect the final output. Record the source and license of each asset.')
table(['COMPONENT','INITIAL CHOICE / INTEGRATION REQUIREMENT'],[
 ('Assembly engine','FFmpeg for deterministic trimming, scaling, concatenation, mixing and encoding [S12].'),
 ('Stickman format','Adapt the supplied storyboard/prompt approach as one optional visual preset [R1]. A generation provider still has to make the clips.'),
 ('Other open-source editor','Require a headless command or documented project format, deterministic output, fonts and plugins, error reporting and commercial-license review.'),
 ('Scene repair','Keep scene IDs stable; regenerate only changed assets or narration, then rebuild affected editions.'),
 ('Packaging','Separate title, description, thumbnail text and captions for EN/ES/IT. Keep thumbnails legible at phone size.')],[.27,.73])
h('Proposed technical quality targets')
add('Use 1080p H.264/AAC MP4 as the first delivery preset, with a fixed frame rate appropriate to the sources. For the pilot, target an integrated mix near -16 LUFS and true peak at or below -1 dBTP; these are internal starting targets, not asserted YouTube requirements. Validate frame dimensions, audio presence, complete decoding, intelligible captions and duration alignment.')
add('Inspect the beginning, end, every scene transition and all flagged intervals. Black-frame or silence detection must allow intentional creative pauses. A successful encoder exit alone does not mean the video is editorially ready.')
add('Review the license of the chosen FFmpeg build and enabled libraries before redistribution; the project documents LGPL/GPL differences [S12a]. The supplied stickman package is a directing skill, not an installed video editor.')

page(16,'Three-language production','Reuse the picture, adapt the experience','Your requested default is three separate channels per family: English, Spanish and Italian.')
h('The localization loop')
add('1. Lock English meaning and scene structure. 2. Translate and adapt the script to the chosen locale. 3. Review idioms, names, units, humor and factual meaning. 4. Generate the matching narration. 5. Measure each scene. 6. Shorten wording or retime flexible visuals. 7. Localize visible text, captions, title, description and thumbnail. 8. Review and render each edition independently.')
table(['CASE','EXPECTED BEHAVIOR'],[
 ('No text; similar timing','Reuse the visual timeline, replace narration and remix audio. Avoid re-encoding unchanged video when technically compatible.'),
 ('Spanish line is longer','Try a natural shorter adaptation first; adjust scene hold or transition if needed. Reject unnatural speed.'),
 ('English text is visible','Swap the text layer or replace the shot. An English-only screenshot may need an explanation or local substitute.'),
 ('Face speaks on camera','Allow lip mismatch only if editorially acceptable; otherwise separately test authorized lip-sync or choose voiceover visuals.'),
 ('One edition fails','Keep that edition paused; do not upload it just because English passed. The others may proceed under family settings.')],[.30,.70])
h('Optional alternative: one channel, multiple audio tracks')
add('YouTube supports additional language audio through Studio for channels with the required feature access [S8]. This can reduce channel administration. It is an alternative to evaluate, not a change to your requested 30-45 channel plan. The documentation reviewed describes a Studio workflow; a supported public API route for uploading alternate audio tracks was not verified. Do not promise full automation for that route.')
add('Set a pilot timing tolerance, such as less than 0.25 seconds of unintended drift at scene transitions, then tune it by listening. Have proficient Spanish and Italian reviewers evaluate the first editions and periodically sample later releases.')
call('Optimize for one original story with three natural editions. Reusing your own visuals is useful; merely mass-producing near-identical low-value stories is not a quality strategy [S7].')

page(17,'Publishing','Make uploading predictable and recoverable','A finished render, an uploaded video, a scheduled video and a published video are separate states.')
h('Channel connection and preflight')
add('Authorize each channel through the appropriate Google OAuth flow. Confirm the returned channel ID and display its name/avatar before binding it to a language. Ordinary multi-channel ownership does not imply access to YouTube CMS content-owner features. Request only needed scopes and confirm account-specific authorization in the pilot [S3, S4].')
add('Preflight checks the exact content version, destination, language, file hash, rights/QC result, user automation policy, title and description, audience designation, synthetic-content disclosure, future schedule time, spend and remaining quota.')
h('Upload and schedule sequence')
bullets([
 'Create a durable publication record, acquire its lock and start a resumable upload. Save the session reference and returned video ID as soon as available.',
 'Upload privately; verify processing and attach the required thumbnail and captions. An attachment failure retries that attachment, not the entire video.',
 'After all mandatory checks pass, set the schedule. YouTube’s publishAt requires a private video that has not previously been published; a past time can publish immediately [S6].',
 'Poll conservatively for final processing and actual visibility. Store the observed result; notify only on meaningful failure, completion or required action.'
])
h('External prerequisites')
add('Uploads from applicable unverified API projects are restricted to private visibility until the project passes YouTube’s audit [S2]. OAuth app verification, publishing audit, analytics-use approval and quota extension are separate work items. Their timing is external and can delay public launch.')
add('Implement the appropriate audience and synthetic-media fields, including status.containsSyntheticMedia where applicable [S6, S11]. A local rights check cannot guarantee absence of a future Content ID claim or monetization issue. Route claims and platform notices to an operator.')
call('If a network failure leaves the upload outcome unknown, reconcile the channel before retrying. Never blindly upload a second copy.')

page(18,'Learning loop','Learn from your own channel evidence','The analyst should change one meaningful thing at a time and preserve the measurement context.')
table(['WHEN','WHAT TO CHECK','WHAT IT CAN CHANGE'],[
 ('After upload','Processing, privacy, correct edition and schedule','Repair technical or destination problems.'),
 ('About 24-48 hours','Available early views, watch time, retention and packaging reports','Investigate a mismatch; avoid declaring winners from tiny samples.'),
 ('About 7 days','Same-age episode results and traffic context','Propose the next hook, topic or pacing test.'),
 ('About 28 days','Audience patterns, available returning-viewer/revenue reports and production costs','Keep, revise or pause a series; adjust capacity.'),
 ('90-100 channel days','Predefined audience objective, production reliability and budget','Continue, pivot or retire that channel hypothesis.')],[.23,.41,.36])
add('Retrieve only supported report/metric combinations; metrics may be delayed or suppressed. Show “available through” date. Use authorized Studio imports when an API does not expose the needed owner metric, and distinguish imported data. Do not turn missing revenue into zero [S4].')
h('Experiment record')
add('Record the hypothesis, changed variable, control, language, comparable format, exposure window, available sample size and stop rule. Native randomized testing is preferable where the channel has access. Sequential thumbnail or title changes are confounded by time, audience and traffic shifts; label them observational. Do not claim causation from a before/after comparison.')
h('Example learning action')
add('If your own report shows a drop around a long introduction, propose a shorter introduction in the next comparable episode. Preserve the previous version and annotation. Review whether the next result supports the hypothesis before applying the change to all families. Do not repeatedly mutate already-published content simply to chase short-term noise.')
add('Custom ratios, rankings, automated classifications and aggregated sentiment from YouTube API data remain behind the approved analytics mode [S9a]. Built-in metrics can be displayed with their definitions. Keep EN/ES/IT results separate before comparing language-market behavior.')
call('The program improves its saved editorial playbook. It does not need to train a new foundation model or build a complex reinforcement-learning system.')

page(19,'Repository due diligence','What to reuse from the three repositories','Read-only review of selected files at pinned revisions. No dependencies were installed and no repository pipeline was executed.')
table(['REPOSITORY','VERIFIED FINDING','PROPOSED USE / GAP'],[
 ('stickman-video-director [R1]','MIT. English README describes a directing skill, six scene prompts and a roughly one-minute output.','Reuse storyboard structure and visual continuity rules as an optional short-video preset. It does not provide a complete rendering or publishing backend.'),
 ('youtube-automation-agent [R2]','MIT; package version 2.10.0. Node/Express/SQLite app, publishing agent, recovery service and production tables were inspected.','Best candidate base. Preserve useful pipeline/checkpoint behavior. Add family/language records and audit all account-selection paths before multi-channel use.'),
 ('Agent-Reach [R3]','MIT. Selected MCP server exposes get_status; actual reading/searching relies on upstream tools. YouTube adapter checks yt-dlp; Reddit adapter depends on authenticated backends.','Use its diagnostics and approved upstream connectors behind a restricted adapter. It is not itself a full internet-reading MCP API or a guarantee of platform access.')],[.24,.39,.37])
h('Concrete changes identified in the candidate base')
add('The inspected credential manager writes tokens to a JSON file and uses a single tokens.youtube slot. Replace or isolate that path with protected per-channel credential references. The inspected production and publication table definitions lack explicit family/language destination fields; migrate these before parallel channel operation. The publishing code already handles uncertain upload outcomes and known-video reconciliation; preserve and verify that behavior [R2a-R2c].')
h('Reuse discipline')
add('Pin each revision, keep MIT copyright/license notices, check dependency and asset licenses separately, inspect scripts before installing, then run a small isolated fixture. Do not concatenate prompts and call it a shared brain. Reuse tested modules, contracts and design patterns. Provider names in a README are not confirmation that those services are available to your account.')

page(20,'Integration plan','Extract useful parts without merging three apps','The target is one coherent workflow with small, replaceable connections.')
table(['STEP','WORK','DELIVERABLE / GATE'],[
 ('1. Isolated trial','Fetch pinned source; inspect dependency scripts and configuration; disable publishing and paid calls for the first dry run.','A capability map: present, tested, incomplete or replaced.'),
 ('2. Choose the base','Run one licensed fixture through the candidate app. Retain it if the state flow and editing needs fit.','A recorded keep/adapt decision. Otherwise build only the missing pipeline around the same contracts.'),
 ('3. Isolate identity','Add family, channel and edition IDs; replace single-account secret access; audit every query and upload call.','Two-channel isolation tests pass before scale.'),
 ('4. Connect research','Prefer official APIs and approved feeds. Expose permitted upstream tools through fixed functions or narrow MCP tools.','Evidence pack with access status, references and expiry.'),
 ('5. Add directing preset','Adapt the stickman storyboard to the manifest; remove fixed six-scene assumptions for longer formats.','One consistent visual sample and a cost benchmark.'),
 ('6. Add locales','Separate script, narration, visible text and packaging by language.','One English master yields three checked editions.'),
 ('7. Harden operation','Add saved job leases, budgets, cost accounting, reconciliation, recovery and backup checks.','A sustained pilot that can restart without duplicate uploads.')],[.20,.46,.34])
h('Suggested tool surface - proposed, not existing endpoints')
add('research.collect(brief), evidence.get(source_id), render.submit(manifest), render.status(job_id), youtube.upload_private(edition_id), youtube.schedule(publication_id), analytics.fetch(channel_id, window). The server resolves allowed files and credentials from IDs; models cannot supply arbitrary file paths, access tokens or shell commands.')
add('MCP is useful for external tool interoperability. A direct library/API call is simpler for core YouTube operations and local rendering. Use a fixed executable plus validated arguments for any CLI adapter; do not build shell commands from article text or model output [S13].')

page(21,'Operations','Automation needs a reliable exception path','The control room should make failures recoverable without losing finished work or spending twice.')
table(['FAILURE','APPLICATION RESPONSE'],[
 ('Provider timeout','Keep provider job ID; query its status before another paid request. Back off and stop after the retry ceiling.'),
 ('Worker crash or reboot','Resume saved work after the lease expires. Validate cached file hashes before reuse.'),
 ('Quota or budget exhausted','Pause affected calls until a permitted window or budget change. Keep completed media.'),
 ('Expired channel access','Pause that channel and request reconnection; other authorized families may continue.'),
 ('Uncertain upload','Reconcile the saved session/video/destination. If ambiguous, require review rather than duplicate.'),
 ('Rights or language failure','Pause that edition; present the exact scene, source or asset that needs repair.'),
 ('Low disk or bad file','Stop render admission, retain source files and alert with required free space.'),
 ('Revoked permission','Disable access, follow required deletion/refresh rules and remove secrets from active use.')],[.30,.70])
h('Minimum operational design')
add('Save state transitions in transactions. Use unique job keys, atomic lease claims, heartbeats, bounded retries and a failed-job queue. Maintain separate research, generation and render limits. A user pause stops new work and cancels queued publication where possible; clearly show uploads or schedules already accepted by YouTube.')
h('Account and content protection')
add('Protect secrets with an OS secret store or server secret manager. Restrict dashboard access, use HTTPS for remote operation, redact logs and prevent cross-family data access. Restrict source fetches to approved destinations and media workers to their job directory. Treat retrieved content as untrusted: it cannot change prompts, tools, budgets or account settings.')
add('Back up database and manifests daily; retain approved source assets and final renders according to user policy. Proposed recovery targets: no more than one day of metadata loss and restoration within four hours. Test a restore before production. Retention must also follow source-specific data obligations [S9].')

page(22,'Quota and capacity','Plan for the bottleneck beyond video uploads','Verified 7 September 2026. Read the live Cloud Console before setting production limits.')
add('Current YouTube documentation specifies separate daily buckets: 100 search.list calls, 100 videos.insert calls, and 10,000 units shared by other endpoints. Each call in the first two buckets costs one. Captions insert costs 400 units, thumbnail set 50, and video update 50. The quota page’s generated summary still mentions an older upload cost; this plan uses the updated body/table and method pages [S1-S3].')
table(['DAILY ILLUSTRATION','10 FAMILIES','15 FAMILIES'],[
 ('One original / family / day','10 masters','15 masters'),('Three separate editions','30 uploads','45 uploads'),('Search plan: 3 queries × 2 pages / family','60 search calls','90 search calls'),('One caption + thumbnail + update / edition','15,000 other units','22,500 other units'),('Plus illustrative read reserve of 500','15,500 total','23,000 total')],[.58,.21,.21])
add('The shared quota exceeds the documented default in both daily scenarios. Request an appropriate quota increase, reduce cadence or distribute work across days. Do not evade quotas with extra projects. Actual request logs and account limits determine feasibility; retries, extra caption tracks and metadata changes add usage.')
h('Render and storage sizing - assumed, to benchmark')
add('At 30 editions/day and 20 minutes per final encode, demand is 10 worker-hours/day before retries and shared visual generation. Four equivalent workers at 70% effective utilization take about 3.6 elapsed hours. At 45 editions/day, the same calculation is about 5.4 hours. AI visual generation can dominate these times.')
add('Assuming 0.5 GB per final file: 30/day produces about 450 GB/month and 45/day about 675 GB/month, before sources, working files and backups. Uploading 15 GB at a sustained 20 Mbps takes about 100 minutes in ideal conditions. Measure real storage, network and encode speed on the actual machine.')
call('Start at two original videos per family per week and spread editions across the calendar. Daily topic research does not require daily publication on all 30-45 channels.')

page(23,'Economics','Set a budget per three-language content pack','All amounts here are illustrative USD planning inputs, not vendor quotes, income forecasts or a promise of profitability.')
table(['EXAMPLE COST INPUT','PER ORIGINAL TOPIC'],[
 ('Research + English writing + reusable visuals','$8'),('Narration and final encode: $2 × 3 editions','$6'),('Localization: $1 × 2 additional languages','$2'),('Three-edition packaging / automated checks allowance','$2'),('<b>Example variable total per content pack</b>','<b>$18</b>')],[.76,.24])
add('This example assumes a simple, mostly reusable visual style. Premium generated video, many retries, licensed footage or long duration can push costs much higher. Human editing and native-language review are additional unless explicitly included in a supplier contract.')
table(['SCENARIO','PACKS / MONTH','VARIABLE AT $18','+20% RESERVE + $200 FIXED'],[
 ('1 family, 2 originals/week','8.7','$156','$387'),('10 families, 2 originals/week','86.7','$1,560','$2,072'),('10 families, daily (30 days)','300','$5,400','$6,680'),('15 families, daily (30 days)','450','$8,100','$9,920')],[.40,.16,.18,.26])
add('Weekly scenarios use 52/12 weeks per month. The $200 fixed allowance represents an assumed hosting/storage/tool budget and must be replaced by quotes. It excludes development labor, taxes, human review, major footage licenses and hardware purchases. A low-volume pilot may have different fixed costs.')
h('The program’s cost controls')
add('Reserve estimated cost before dispatch. Track text tokens, narration minutes, generated-image/video requests, retries, render time and storage. Reconcile actual charges where the provider supplies them. Enforce per-stage, per-topic, per-family and monthly caps; route expensive fallback choices to the user’s saved spending rules.')
add('Development budgeting: estimated hours × agreed hourly rate, plus third-party setup and contingency. For a rough 400-700 hour scope, a chosen $25/hour assumption means $10,000-$17,500; $50/hour means $20,000-$35,000. These are arithmetic examples, not a project bid. Final effort depends on the repository trial and required editing complexity.')

page(24,'Build roadmap','Days 1-30: prove the English pipeline','Planning estimate for an experienced builder with creator feedback and specialist reviews. A solo beginner should allow longer.')
table(['WINDOW','BUILD IN ORDER','EXIT EVIDENCE'],[
 ('Days 1-7','Confirm audience/format/budget; inspect pinned repositories; inventory licenses and editor interfaces; begin Google access/audit work; choose a pilot topic fixture.','Approved one-page channel brief, capability map, fixture and ordered backlog.'),
 ('Days 8-14','Launch the local dashboard; add family/channel/edition records and safe credentials; collect official public metadata and source references; implement saved jobs.','UI creates a sourced brief and resumes an interrupted dry-run job.'),
 ('Days 15-21','Implement outline, hooks, claim ledger, script review, scene manifest and voice audition. Add deterministic editing with original/licensed media.','A local English preview with correct narration, scenes and reproducible output.'),
 ('Days 22-30','Add final QC, review state, private upload, attachments, destination confirmation and unknown-outcome handling. Record measured cost/time.','One English video privately uploaded to the intended channel and recovered safely from a simulated failure.')],[.20,.47,.33])
h('What belongs in this first release')
add('One operator, one family, one English destination, one tested text provider, one voice provider, one editing style, saved assets, basic evidence links, explicit review and a simple cost ledger. Design records for three languages now, but prove one edition before multiplying jobs.')
h('What waits')
add('Do not add 15 niches, multiple competing orchestration frameworks, a custom model-training pipeline, an elaborate vector database, a desktop wrapper or several untested media providers. Search in structured records first. Add semantic retrieval when the actual content library makes it useful.')
call('Day-30 success is a technically dependable private pilot. Public launch remains dependent on channel readiness, permissions and the applicable YouTube project audit.')

page(25,'Build roadmap','Days 31-70: add languages and operations','The first full family is the test bed for the entire portfolio.')
table(['WINDOW','BUILD IN ORDER','EXIT EVIDENCE'],[
 ('Days 31-40','Add Spanish/Italian locales, scene translation, pronunciation dictionaries, narration timing, localized packaging and edition-specific reviews.','One story produces three intelligible editions with correct metadata and destinations.'),
 ('Days 41-50','Add recurring research, source freshness, topic deduplication, candidate briefs and an editable calendar. Keep unapproved analytics features disabled.','A one-week queue has evidence, cost estimates and meaningful topic variety.'),
 ('Days 51-60','Add bounded concurrency, leases, retry/reconciliation controls, disk admission, connector health, per-family caps, notifications and backups.','The queue survives restart, provider failure, expired access and a restored backup.'),
 ('Days 61-70','Add supported owner analytics, measurement dates and a simple experiment record. Trial a second family before adding more.','Two families run with no cross-channel identity leakage; costs and reports can be traced.')],[.20,.47,.33])
h('Human responsibilities during this phase')
add('The creator owns niche judgment, rights decisions and publication policy. A proficient reviewer checks Spanish and Italian samples. The builder owns failures, deployment and access controls. These responsibilities can be held by a small team; the AI role names do not imply ten human hires.')
h('Proposed gate for limited unattended publishing')
add('Require at least ten consecutive reviewed editions for a specific format with no material factual, rights, language or destination error; a successful recovery drill; known per-pack cost; and no unresolved account/access issue. This is a proposed operating threshold, not a statistical guarantee. The user can then enable unattended publication for that format and budget only.')
add('New niches, new voices, changed providers or materially different templates return to sampling and review. Keep a visible portfolio pause and a per-family pause. A quality failure should not silently switch to a cheaper low-quality asset or fabricated evidence.')

page(26,'Scale and growth','Days 71-100: expand from proven evidence','Increasing channel count is a gated decision; neither the calendar nor a promising score should force expansion.')
story.append(Diagram('roadmap',245))
table(['SCALE GATE','PROPOSED REQUIREMENT'],[
 ('1 → 3 families','Two-channel isolation and three-language workflow pass; previous pilot has stable costs and a repairable queue.'),
 ('3 → 5 families','At least 14 days of reliable scheduled operation, enough review capacity and no unresolved access blockers.'),
 ('5 → 10-15 families','Quota and render headroom verified; budget approved; each new family has a differentiated topic supply and owner.'),
 ('Hold or reduce','Quality declines, queue latency grows, costs exceed caps or audience evidence does not support the format.')],[.29,.71])
h('Channel growth checkpoints - counted from first public upload')
add('<b>Day 0:</b> register the hypothesis, cadence, budget and objective. <b>Day 30:</b> review the first comparable episodes and validate the audience problem. <b>Day 60:</b> test the strongest improvements and stop weak series. <b>Day 90-100:</b> continue, pivot or retire based on predefined evidence and cost. Two originals per week yields roughly 26 originals over 90 days; daily posting is not required to learn.')
add('Define “excel” before launch: an agreed audience outcome, acceptable production cost and a sustainable repeatable format. No responsible system can guarantee a particular subscriber count, search rank, revenue level or monetization approval within 100 days.')

page(27,'Acceptance tests','What “working” must mean','Test the expensive and consequential failure paths, not just a successful demo.')
table(['CHECK','ACCEPTANCE EVIDENCE'],[
 ('Correct channel isolation','An EN edition cannot be published with ES or another family’s credentials, even when the submitted channel ID is changed.'),
 ('Source integrity','Every externally verifiable claim links to evidence; unknown/expired access blocks dependent production or triggers a rewrite.'),
 ('Three-language fidelity','Proficient reviewers find no material meaning or pronunciation errors in pilot editions; visible text and metadata match the language.'),
 ('Media integrity','Complete file decodes; expected video/audio/captions exist; transitions and all flagged intervals pass review.'),
 ('Restart recovery','Kill a worker after scene generation and during upload. Finished scenes are reused; uncertain upload is reconciled.'),
 ('No duplicate spending','Repeated job submission shares the saved stage result or existing provider task; actual exceptional charges remain visible.'),
 ('Budget and quota','A job exceeding the configured ceiling pauses before a paid call. Quota exhaustion delays only affected work.'),
 ('Publish correctness','Private upload, attachments, future schedule and actual visibility are confirmed separately. Past times are rejected by the app.'),
 ('Revocation + deletion','Disconnect stops new access. Source data and credentials follow documented retention/deletion behavior.'),
 ('Backup + sustained load','Restore the app from backup; run a representative multi-family queue with measured latency, costs and no destination mix-ups.')],[.28,.72])
add('Proposed operational target after the pilot: at least 95% of eligible scheduled jobs finish within the promised window across a 14-day observation period. Define “eligible” and record external platform delays separately. A missed goal triggers investigation; it is not hidden by skipping failed jobs.')
call('The release checklist is complete only when the tests pass on the actual connected accounts and media providers. This PDF supplies the acceptance criteria; it does not claim those tests have run.')

page(28,'Start here','The first seven days and the handoff','The next development task should be narrow enough to complete and inspect.')
table(['DAY','CONCRETE OUTPUT'],[
 ('1','Choose one audience profile, one original format, a duration range and a spend ceiling. Write the channel promise in one sentence.'),
 ('2','Record the three repository revisions and licenses; inspect candidate editor interfaces and dependency scripts.'),
 ('3','Create the isolated application workspace; run the candidate base with test fixtures and publishing disabled.'),
 ('4','Add family/channel/edition records and protected credential access; test destination selection with two dummy identities.'),
 ('5','Build one evidence brief and original script; review the story and choose a voice audition sample.'),
 ('6','Produce a short scene fixture, measure cost and duration, then test a stopped/resumed render.'),
 ('7','Demonstrate the UI, source pack and rendered fixture; approve the exact first end-to-end English milestone.')],[.12,.88])
h('Implementation ticket to open first')
call('Create a single-family English pilot in the selected base: user profile → sourced brief → reviewed script → scene manifest → narrated render → QC → private test upload, with saved state, cost tracking and confirmed channel identity.')
h('Inputs still to collect before dependent work')
add('Actual Tier A/B market definitions; chosen niche candidates; long-form/Shorts preference; weekly cadence; monthly operating budget; computer/server specifications; the additional editor repositories; channel ownership/access; permitted media sources; chosen Spanish locale; preferred voices and any clone consent. These are configuration and procurement decisions, not reasons to delay the blueprint.')
add('Start with original or clearly licensed material while access requests are processed. More repositories should be evaluated against the same capability map, not merged automatically. After the English pilot, the next demonstrable milestone is one master with three reviewed language editions.')
add('This plan preserves your full ambition: evidence-based niche discovery, daily topic research, distinctive scripts, expressive voiceover, automated editing, publishing, daily queue management and 10-15 multilingual families. It stages the work so each new layer rests on tested behavior.')

SOURCES=[
 ('S1','YouTube Data API quota calculator','https://developers.google.com/youtube/v3/determine_quota_cost','Separate quota buckets and endpoint costs; updated body/table used.'),
 ('S2','YouTube videos.insert','https://developers.google.com/youtube/v3/docs/videos/insert','Upload method, quota bucket and private-only restriction for applicable unverified projects.'),
 ('S3','YouTube search.list','https://developers.google.com/youtube/v3/docs/search/list','Search bucket, pagination, region/language meaning and uploads-playlist guidance.'),
 ('S4','YouTube Analytics and Reporting introduction','https://developers.google.com/youtube/reporting','Owner authorization and the distinction between targeted and bulk reports.'),
 ('S4a','YouTube Analytics channel reports','https://developers.google.com/youtube/analytics/channel_reports','Supported owner report combinations and authorization.'),
 ('S5','YouTube captions.download','https://developers.google.com/youtube/v3/docs/captions/download','Downloading captions requires permission to edit the video.'),
 ('S6','YouTube video resource','https://developers.google.com/youtube/v3/docs/videos','Scheduling prerequisites, audience designation and synthetic-media field.'),
 ('S7','YouTube channel monetization policies','https://support.google.com/youtube/answer/1311392?hl=en','Originality, reused content and repetitive/mass-produced content.'),
 ('S8','YouTube multi-language features','https://support.google.com/youtube/answer/13338784?hl=en','Studio-based alternate audio, access requirements and localization.'),
 ('S9','YouTube developer policies','https://developers.google.com/youtube/terms/developer-policies','API data handling, base derived-data restrictions and additional-permission route.'),
 ('S9a','Additional policies for derived metrics and data storage','https://developers.google.com/youtube/terms/derived-metrics-policy','Accepted analytics use cases and conditional storage allowances.'),
 ('S9b','Complying with YouTube developer policies','https://developers.google.com/youtube/terms/developer-policies-guide','Do not enable additional analytics/storage without applicable permission.'),
 ('S10','Reddit Data API Terms','https://redditinc.com/policies/data-api-terms','Access/use restrictions, commercial permission and permitted content use.'),
 ('S11','YouTube disclosure of GenAI content','https://support.google.com/youtube/answer/14328491','When realistic altered or generated content requires disclosure.'),
 ('S12','FFmpeg filters documentation','https://ffmpeg.org/ffmpeg-filters.html','Assembly, mixing, subtitles and loudness-related filter capabilities.'),
 ('S12a','FFmpeg license considerations','https://ffmpeg.org/legal.html','License depends on the build and enabled components.'),
 ('S13','MCP architecture overview','https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture','Host/client/server architecture and tool integration concepts.'),
]
def refitem(k,title,url,note):
    add(f'<b>[{k}] {escape(title)}</b><br/><link href="{escape(url)}" color="#087E8B">Open primary source</link> • {escape(note)}','ref')
page(29,'Sources','Primary platform references','Sources checked on 7 September 2026. Linked references support external facts; the workflow, budgets and milestones are proposed project choices.')
for row in SOURCES[:9]:refitem(*row)
add('Platform documentation can change. Recheck quota, OAuth, analytics permissions, media disclosure and publishing behavior before implementation and again before scale. Dates and figures in this plan describe the sources inspected, not permanent platform guarantees.','small')

page(30,'Sources','Policy and implementation references','These constraints are included because they affect whether the requested program can run reliably at the intended scale.')
for row in SOURCES[9:]:refitem(*row)
h('Evidence boundaries')
add('Repository inspection covered public metadata, license files and selected source files. It did not cover every dependency, every feature, model availability, runtime security or a successful live upload. The repository authors’ marketing and readiness claims are not treated as independent proof.')
add('No live niche study was commissioned or completed as part of this blueprint. The topic example, scoring example, UI counters, budget figures, time estimates and quality thresholds are explicitly illustrative or proposed. Actual costs and audience response must come from the pilot.')

page(31,'Repository register','Pinned source and handoff record','Use these exact revisions to reproduce the findings, then review any later changes before adoption.')
repo_refs=[
 ('R1','Stickman Video Director','https://github.com/kaomei/stickman-video-director/tree/6d7f8c83a16c594c23bb73da832c8864ccd2aeb5','Revision 6d7f8c83a16c • MIT. Inspected English README, license, repository tree and storyboard template.'),
 ('R2','YouTube Automation Agent','https://github.com/darkzOGx/youtube-automation-agent/tree/260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b','Revision 260d7a94ab2d • MIT. Inspected README, package, license, database, credentials, publishing and recovery files.'),
 ('R2a','Credential manager','https://github.com/darkzOGx/youtube-automation-agent/blob/260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b/utils/credential-manager.js','Single tokens.youtube access and JSON token persistence in the inspected file.'),
 ('R2b','Database schema','https://github.com/darkzOGx/youtube-automation-agent/blob/260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b/database/db.js','Inspected production/publication table definitions need explicit multi-family destination design.'),
 ('R2c','Publishing agent','https://github.com/darkzOGx/youtube-automation-agent/blob/260d7a94ab2d5bb2a98ce6620bfda7efd56ebd6b/agents/publishing-scheduling-agent.js','Existing uncertain-upload handling and reconciliation paths to retain and test.'),
 ('R3','Agent-Reach','https://github.com/Panniantong/Agent-Reach/tree/da5044d26fc6adddb6554d5679c94ac22e76e428','Revision da5044d26fc6 • MIT. Inspected README, license, package metadata, YouTube/Reddit adapters and MCP server.'),
 ('R3a','Agent-Reach MCP integration','https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/integrations/mcp_server.py','The inspected server exposes get_status. Reading/searching is delegated to upstream tools.'),
]
for row in repo_refs:refitem(*row)
h('Supplied image record')
add('Screenshot_20260805-162242.png; Screenshot_20260805-162247.png; Screenshot_20260805-162250.png; Screenshot_20260805-162251.png; Screenshot_20260805-162253.png; Screenshot_20260805-162255.png. Used as conceptual references; not embedded, executed or treated as policy.','small')
call('Ready to hand to a builder: begin with page 28, implement the first milestone on page 24, and use page 27 as the release standard.')

class NumberedCanvas(canvas.Canvas):
    def __init__(self,*a,**kw): super().__init__(*a,**kw);self._saved=[]
    def showPage(self):self._saved.append(dict(self.__dict__));self._startPage()
    def save(self):
        n=len(self._saved)
        for state in self._saved:
            self.__dict__.update(state);self.draw_footer(n);super().showPage()
        super().save()
    def draw_footer(self,n):
        self.setStrokeColor(LINE);self.setLineWidth(.5);self.line(44,43,W-44,43)
        self.setFont('Body',8);self.setFillColor(MUTED);self.drawString(44,29,'YOUTUBE AUTOMATION PROGRAM  /  BUILD BLUEPRINT')
        self.drawRightString(W-44,29,f'{self._pageNumber:02d} / {n:02d}')
def header(c,doc):
    c.setFillColor(TEAL);c.rect(44,H-32,25,3,fill=1,stroke=0)
    c.setFont('Bold',8);c.setFillColor(MUTED);c.drawRightString(W-44,H-32,'RESEARCHED 07 SEP 2026')

doc=SimpleDocTemplate(str(OUT),pagesize=(W,H),rightMargin=44,leftMargin=44,topMargin=55,bottomMargin=59,title='YouTube Automation Program - Detailed Build Blueprint',author='Prepared for the project owner',subject='Architecture, multilingual workflow, repository integration and phased build plan')
doc.build(story,onFirstPage=header,onLaterPages=header,canvasmaker=NumberedCanvas)
print(OUT)
print('Planned sections:',len(sections))
