export const forecastQuestions = Object.freeze([
  Object.freeze({
    id: 'he-episode-01-customer-evolution-v1',
    episode: '01',
    title: 'Customer Evolution',
    prompt: 'Will at least three of Netflix, Disney+, HBO Max, Peacock, and Paramount+ report more U.S. subscribers on ad-supported plans than ad-free plans by December 31, 2029?',
    state: 'draft',
    opensAt: null,
    closesAt: null,
  }),
  Object.freeze({ id: 'he-question-02-media-supply-chain-evolution-v1', episode: null, title: 'Media Supply Chain Evolution', prompt: 'By December 31, 2028, will two major U.S. studios publicly confirm production use of an AI agent that can initiate media-supply-chain actions without per-action human approval?', state: 'draft', opensAt: null, closesAt: null }),
  Object.freeze({ id: 'he-question-03-creator-evolution-v1', episode: null, title: 'Creator Evolution', prompt: 'By December 31, 2030, will a fully synthetic performer receive top billing in a film released in at least 2,000 U.S. theaters?', state: 'draft', opensAt: null, closesAt: null }),
  Object.freeze({ id: 'he-question-04-content-evolution-v1', episode: null, title: 'Content Evolution', prompt: 'By December 31, 2029, will a film with audience-selected narrative branches receive a release in at least 1,000 U.S. theaters?', state: 'draft', opensAt: null, closesAt: null }),
  Object.freeze({ id: 'he-question-05-commercial-evolution-v1', episode: null, title: 'Commercial Evolution', prompt: 'By December 31, 2028, will at least one of Netflix, Disney+, HBO Max, Peacock, and Paramount+ launch click-to-buy product placement inside scripted programming?', state: 'draft', opensAt: null, closesAt: null }),
  Object.freeze({ id: 'he-question-06-audio-evolution-v1', episode: null, title: 'Audio Evolution', prompt: 'By December 31, 2029, will at least two of Netflix, Disney+, HBO Max, Peacock, and Paramount+ let viewers personalize dialogue, music, or effects levels for a scripted title?', state: 'draft', opensAt: null, closesAt: null }),
  Object.freeze({ id: 'he-question-07-vfx-evolution-v1', episode: null, title: 'VFX Evolution', prompt: 'By December 31, 2028, will a major studio publicly state that generative tools created more than half of the final VFX shots in a 2,000-theater release?', state: 'draft', opensAt: null, closesAt: null }),
  Object.freeze({ id: 'he-question-08-animation-evolution-v1', episode: null, title: 'Animation Evolution', prompt: 'By December 31, 2029, will a final U.S. appellate decision hold that training a generative model on unlicensed copyrighted audiovisual works is not fair use?', state: 'draft', opensAt: null, closesAt: null }),
]);

export const audienceCampaigns = Object.freeze([
  Object.freeze({
    id: 'li-episode-01-v1',
    questionId: forecastQuestions[0].id,
    state: 'draft',
    postUrn: null,
    cutoff: null,
    mapping: Object.freeze({ LIGHTBULB: 'yes', PRAISE: 'no', CLAP: 'no' }),
  }),
  ...forecastQuestions.slice(1).map((question, index) => Object.freeze({
    id: `li-question-${String(index + 2).padStart(2, '0')}-v1`,
    questionId: question.id,
    state: 'draft',
    postUrn: null,
    cutoff: null,
    mapping: Object.freeze({ LIGHTBULB: 'yes', PRAISE: 'no', CLAP: 'no' }),
  })),
]);
