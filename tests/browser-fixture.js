'use strict';
// Manual browser QA only: isolated in-memory data and synthetic YouTube responses.
// This entry point is never imported by npm start. No real credentials or network calls.
const {createApp} = require('../server');
const {YouTubeResearch} = require('../youtube');
let fixtureKey = null;
const vault = {
  status: () => ({supported: true, saved: !!fixtureKey}),
  get: () => fixtureKey,
  set: value => {fixtureKey = value;},
  remove: () => {fixtureKey = null;}
};
const research = new YouTubeResearch(vault, async url => {
  if (url.searchParams.get('forHandle') === '@denied') return Response.json({}, {status: 403});
  return Response.json({items: [{id: 'UC'+'a'.repeat(22), snippet: {title: 'TEST FIXTURE <b>literal text</b>', description: 'Synthetic browser test result. No data was fetched from YouTube.'}, statistics: {hiddenSubscriberCount: true, viewCount: '12345', videoCount: '12'}}]});
});
const {server} = createApp({dataFile: ':memory:', research});
server.listen(3457, '127.0.0.1', () => console.log('TEST FIXTURE ONLY http://127.0.0.1:3457 — no external calls; key stored only in test memory.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
