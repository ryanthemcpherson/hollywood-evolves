import { createHmac } from 'node:crypto';

const ALLOWED_SOURCES = new Set(['site', 'linkedin', 'newsletter', 'qr', 'direct']);

function digest(secret, value) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function parseLinkedInReactionCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const expected = 'reaction_id,reaction_type,reacted_at';
  if (lines.shift()?.trim() !== expected) throw Object.assign(new Error(`CSV header must be exactly: ${expected}`), { statusCode: 400 });
  return lines.filter(Boolean).map((line) => {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length !== 3 || fields.some((field) => !field)) throw Object.assign(new Error('Each CSV row must contain exactly three non-empty fields'), { statusCode: 400 });
    return { reactionId: fields[0], reactionType: fields[1], reactedAt: fields[2] };
  });
}

export function generateLinkedInPostCopy({ prompt, pollUrl, cutoff }) {
  const cutoffLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(cutoff));
  return `${prompt}\n\nReact to register an informal binary signal:\n💡 LIGHTBULB = YES\n👏 PRAISE/CLAP = NO\n\nCutoff: ${cutoffLabel} (UTC). Reactions are an informal signal, not probability forecasts. Prefer to answer directly, with optional confidence: ${pollUrl}`;
}

export class AudienceSignalStore {
  constructor({ questions, campaigns = [], secret = 'development-only-change-me', initialState = null, now = () => new Date().toISOString() }) {
    this.questions = new Map(questions.map((question) => [question.id, structuredClone(question)]));
    this.campaigns = new Map(campaigns.map((campaign) => [campaign.id, structuredClone(campaign)]));
    this.secret = secret;
    this.now = now;
    this.directResponses = structuredClone(initialState?.directResponses ?? []);
    this.reactionImports = structuredClone(initialState?.reactionImports ?? []);
    this.audit = structuredClone(initialState?.audit ?? []);
  }

  snapshot() {
    return structuredClone({ version: 1, directResponses: this.directResponses, reactionImports: this.reactionImports, audit: this.audit });
  }

  async recordDirectResponse({ questionId, choice, confidence = null, browserToken, idempotencyKey, source = 'direct' }) {
    const question = this.questions.get(questionId);
    if (!question) throw Object.assign(new Error('Unknown question'), { statusCode: 404 });
    if (question.state !== 'open') throw Object.assign(new Error('Question is not open'), { statusCode: 409 });
    const currentTime = Date.parse(this.now());
    const opensAt = Date.parse(question.opensAt);
    const closesAt = Date.parse(question.closesAt);
    if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt) || currentTime < opensAt || currentTime > closesAt) {
      throw Object.assign(new Error('Question is not accepting responses at this time'), { statusCode: 409 });
    }
    if (!['yes', 'no'].includes(choice)) throw Object.assign(new Error('Choice must be yes or no'), { statusCode: 400 });
    if (confidence !== null && (!Number.isInteger(confidence) || confidence < 1 || confidence > 99)) {
      throw Object.assign(new Error('Confidence must be an integer from 1 to 99'), { statusCode: 400 });
    }
    if (typeof browserToken !== 'string' || browserToken.length < 16 || browserToken.length > 128) {
      throw Object.assign(new Error('Invalid browser token'), { statusCode: 400 });
    }
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      throw Object.assign(new Error('Invalid idempotency key'), { statusCode: 400 });
    }
    const normalizedSource = ALLOWED_SOURCES.has(source) ? source : 'direct';
    const browserHash = digest(this.secret, `${questionId}:${browserToken}`);
    const idempotencyHash = digest(this.secret, `${questionId}:${idempotencyKey}`);
    if (this.directResponses.some((response) => response.idempotencyHash === idempotencyHash)) {
      this.audit.push({ action: 'duplicate_ignored', questionId, source: normalizedSource, at: this.now() });
      return { accepted: false, duplicate: true };
    }
    if (this.directResponses.some((response) => response.browserHash === browserHash)) {
      throw Object.assign(new Error('A response was already recorded for this browser'), { statusCode: 409 });
    }
    const response = { questionId, choice, confidence, source: normalizedSource, browserHash, idempotencyHash };
    this.directResponses.push(response);
    this.audit.push({ action: 'direct_response_recorded', questionId, source: normalizedSource, at: this.now() });
    return { accepted: true };
  }

  async importLinkedInReactions({ campaignId, importKey, rows }) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw Object.assign(new Error('Unknown campaign'), { statusCode: 404 });
    if (campaign.state && campaign.state !== 'active') throw Object.assign(new Error('Campaign is not active'), { statusCode: 409 });
    if (!campaign.postUrn || !campaign.cutoff) throw Object.assign(new Error('Campaign post and cutoff must be finalized'), { statusCode: 409 });
    if (typeof importKey !== 'string' || importKey.length < 16 || importKey.length > 128) {
      throw Object.assign(new Error('Invalid import key'), { statusCode: 400 });
    }
    const importHash = digest(this.secret, `${campaignId}:${importKey}`);
    if (this.audit.some((entry) => entry.importHash === importHash)) {
      this.audit.push({ action: 'duplicate_import_ignored', campaignId, at: this.now() });
      return { imported: 0, ignored: 0, duplicate: true };
    }
    let imported = 0;
    let ignored = 0;
    for (const row of rows) {
      const choice = campaign.mapping[row.reactionType];
      const reactedAt = Date.parse(row.reactedAt);
      const reactionHash = digest(this.secret, `${campaignId}:${row.reactionId}`);
      if (!choice || !Number.isFinite(reactedAt) || reactedAt > Date.parse(campaign.cutoff) || this.reactionImports.some((entry) => entry.reactionHash === reactionHash)) {
        ignored += 1;
        continue;
      }
      this.reactionImports.push({ questionId: campaign.questionId, campaignId, choice, reactionHash });
      imported += 1;
    }
    this.audit.push({ action: 'linkedin_import_completed', campaignId, importHash, imported, ignored, at: this.now() });
    return { imported, ignored, duplicate: false };
  }

  publicResults(questionId) {
    const question = this.questions.get(questionId);
    if (!question) throw Object.assign(new Error('Unknown question'), { statusCode: 404 });
    const responses = this.directResponses.filter((response) => response.questionId === questionId);
    const bySource = {};
    let confidenceTotal = 0;
    let confidenceResponses = 0;
    for (const response of responses) {
      bySource[response.source] ??= { total: 0, yes: 0, no: 0 };
      bySource[response.source].total += 1;
      bySource[response.source][response.choice] += 1;
      if (response.confidence !== null) {
        confidenceTotal += response.confidence;
        confidenceResponses += 1;
      }
    }
    const reactions = this.reactionImports.filter((reaction) => reaction.questionId === questionId);
    const byCampaign = {};
    for (const reaction of reactions) {
      byCampaign[reaction.campaignId] ??= { total: 0, yes: 0, no: 0 };
      byCampaign[reaction.campaignId].total += 1;
      byCampaign[reaction.campaignId][reaction.choice] += 1;
    }
    return {
      questionId,
      state: question.state,
      directForecasts: {
        total: responses.length,
        yes: responses.filter(({ choice }) => choice === 'yes').length,
        no: responses.filter(({ choice }) => choice === 'no').length,
        confidenceResponses,
        averageConfidence: confidenceResponses ? confidenceTotal / confidenceResponses : null,
        bySource,
      },
      linkedInReactions: {
        total: reactions.length,
        yes: reactions.filter(({ choice }) => choice === 'yes').length,
        no: reactions.filter(({ choice }) => choice === 'no').length,
        byCampaign,
      },
    };
  }
}
