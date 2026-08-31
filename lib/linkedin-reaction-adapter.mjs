export class LinkedInReactionImportAdapter {
  constructor({ client } = {}) {
    this.client = client;
  }

  async collect({ postUrn, cutoff }) {
    if (typeof this.client?.listReactions !== 'function') {
      throw new Error('An approved LinkedIn Community Management API client is required; arbitrary public reaction scraping is not supported.');
    }
    const reactions = await this.client.listReactions({ postUrn, cutoff });
    if (!Array.isArray(reactions)) throw new Error('LinkedIn client returned an invalid reaction list.');
    return reactions.map((reaction) => ({
      reactionId: String(reaction.id),
      reactionType: String(reaction.reactionType),
      reactedAt: String(reaction.createdAt),
    }));
  }
}
