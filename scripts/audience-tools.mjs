import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AudienceSignalStore, generateLinkedInPostCopy, parseLinkedInReactionCsv } from '../lib/audience-signals.mjs';
import { audienceCampaigns, forecastQuestions } from '../lib/forecast-questions.mjs';

const [command, ...args] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (command === 'post-copy') {
  const [questionId, campaignId, origin = 'https://hollywoodevolves.mcpherson.app'] = args;
  const question = forecastQuestions.find(({ id }) => id === questionId);
  const campaign = audienceCampaigns.find(({ id, questionId: mappedQuestionId }) => id === campaignId && mappedQuestionId === questionId);
  if (!question || !campaign) fail('Question/campaign mapping not found.');
  else if (!campaign.cutoff) fail('Campaign cutoff is unset. Finalize the post and cutoff before generating publishable copy.');
  else console.log(generateLinkedInPostCopy({ prompt: question.prompt, pollUrl: `${origin.replace(/\/$/, '')}/poll/${question.id}?src=linkedin`, cutoff: campaign.cutoff }));
} else if (command === 'validate-csv') {
  const [csvPath] = args;
  if (!csvPath) fail('Usage: npm run audience:tools -- validate-csv <reactions.csv>');
  else console.log(`Valid rows: ${parseLinkedInReactionCsv(readFileSync(csvPath, 'utf8')).length}`);
} else if (command === 'import-csv') {
  const [campaignId, csvPath, origin = 'https://hollywoodevolves.mcpherson.app'] = args;
  const token = process.env.AUDIENCE_IMPORT_TOKEN;
  if (!campaignId || !csvPath || !token) fail('Usage: AUDIENCE_IMPORT_TOKEN=... npm run audience:tools -- import-csv <campaign-id> <reactions.csv> [origin]');
  else {
    const csv = readFileSync(csvPath, 'utf8');
    parseLinkedInReactionCsv(csv);
    const importKey = `manual-csv-${createHash('sha256').update(csv).digest('hex')}`;
    const response = await fetch(`${origin.replace(/\/$/, '')}/api/linkedin/import`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ campaignId, importKey, csv }),
    });
    const payload = await response.json();
    if (!response.ok) fail(`${response.status}: ${payload.error || 'Import failed'}`);
    else console.log(JSON.stringify(payload));
  }
} else {
  fail('Usage: npm run audience:tools -- <post-copy|validate-csv|import-csv> ...');
}
