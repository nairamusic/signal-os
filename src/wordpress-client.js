/**
 * SIGNAL//OS → NairaMusic.com publisher
 * Auth: X-Signal-Key header (nmc-signal-sync.php on nairamusic.com)
 * Endpoint: POST /wp-json/nmcsignal/v1/sync
 */
function createWordPressClient(env) {
  const base = (env.WP_BASE_URL || 'https://nairamusic.com').replace(/\/$/, '');
  const signalKey = env.NMC_SIGNAL_KEY || '';
  const live = Boolean(signalKey);
  const endpoint = `${base}/wp-json/nmcsignal/v1/sync`;

  return {
    mode: live ? 'live' : 'dry-run',
    status: () => ({
      configured: live,
      mode: live ? 'live' : 'dry-run',
      site: base,
      endpoint,
      keyConfigured: live,
    }),

    /**
     * Push a track (with optional Suno generation) to nairamusic.com as a draft post.
     * @param {object} input – merged job.request + generation
     */
    async publishTrack(input) {
      const generation = input.generation || {};
      const payload = {
        title:       input.title,
        content:     `<!-- SIGNAL_OS:${input.trackId} -->\n<p>${input.artist}</p>`,
        track_id:    input.trackId || '',
        artist:      input.artist || '',
        genre:       input.genre || '',
        bpm:         String(input.bpm || ''),
        signal_tier: input.rotation || input.signal_tier || '',
        suno_url:    generation.audioUrl || input.suno_url || '',
        explicit:    input.explicit || 'clean',
        hook:        input.hook || '',
      };

      if (!live) {
        return {
          dryRun: true,
          status: 'draft',
          endpoint,
          payload,
          message: 'Add NMC_SIGNAL_KEY to .env to push drafts to nairamusic.com.',
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-Signal-Key': signalKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`NairaMusic.com API ${response.status}: ${text}`);
      }

      const result = await response.json();
      return {
        dryRun:   false,
        id:       result.post_id,
        status:   'draft',
        editUrl:  result.edit_url,
        preview:  result.preview,
        message:  result.message,
      };
    },
  };
}

module.exports = { createWordPressClient };
