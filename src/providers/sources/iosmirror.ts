import { EmbedOutput, makeEmbed } from '@/providers/base';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';
import { compareTitle } from '@/utils/compare';

// Common types for both scrapers
type metaT = {
  year: string;
  type: 'm' | 't';
  season: { s: string; id: string; ep: string }[];
};

type searchT = { status?: 'y' | 'n'; searchResult?: { id: string; t: string; y?: string }[]; error: string };

type episodeT = { episodes: { id: string; s: string; ep: string }[]; nextPageShow: number };

const providers = [
  {
    id: 'netmirror',
    rank: 300,
    baseUrl: 'https://iosmirror.cc',
    baseUrl2: 'https://filmueproxy.vercel.app/iosmirror.cc:443',
    statusCheck: (res: searchT) => res.status === 'y'
  },
  {
    id: 'primemirror',
    rank: 290,
    baseUrl: 'https://iosmirror.cc',
    baseUrl2: 'https://filmueproxy.vercel.app/iosmirror.cc:443/pv',
    statusCheck: () => true
  },
];

function embed(provider: { id: string; rank: number; baseUrl: string; baseUrl2: string; statusCheck: (res: searchT) => boolean }) {
  return makeEmbed({
    id: provider.id,
    name: provider.id.toUpperCase(),
    rank: provider.rank,
    disabled: false,
    async scrape(ctx) {
      let progress = 10;
      const interval = setInterval(() => {
        if (progress < 90) {
          progress += 5;
          ctx.progress(progress);
        }
      }, 100);

      try {
        const query = JSON.parse(ctx.url);
        const hash = decodeURIComponent(await ctx.fetcher('https://filmuworker.entertainmentfilmu.workers.dev/'))
        if (!hash) throw new NotFoundError('No hash found');

        const searchRes = await ctx.fetcher<searchT>('/search.php', {
          baseUrl: provider.baseUrl2,
          query: { s: query.title },
          headers: { cookie: makeCookieHeader({ t_hash_t: hash, hd: 'on' }) },
        });

        if (!provider.statusCheck(searchRes) || !searchRes.searchResult) {
          throw new NotFoundError(searchRes.error || 'No search results found');
        }

        async function getMeta(id: string) {
          return ctx.fetcher<metaT>('/post.php', {
            baseUrl: provider.baseUrl2,
            query: { id },
            headers: { cookie: makeCookieHeader({ t_hash_t: hash, hd: 'on' }) },
          });
        }

        // Find matching content
        let id = searchRes.searchResult.find(async (x) => {
          const metaRes = await getMeta(x.id);
          return (
            compareTitle(x.t, query.title) &&
            ((x.y ? Number(x.y) : Number(metaRes.year)) === Number(query.releaseYear) || 
             metaRes.type === (query.type === 'movie' ? 'm' : 't'))
          );
        })?.id;

        if (!id) throw new NotFoundError('No watchable item found');

        // Handle shows
        if (query.type === 'show') {
          const metaRes = await getMeta(id);
          
          const seasonId = metaRes?.season.find((x) => Number(x.s) === Number(query.season))?.id;
          if (!seasonId) throw new NotFoundError('Season not available');

          const episodeRes = await ctx.fetcher<episodeT>('/episodes.php', {
            baseUrl: provider.baseUrl2,
            query: { s: seasonId, series: id },
            headers: { cookie: makeCookieHeader({ t_hash_t: hash, hd: 'on' }) },
          });

          let episodes = [...episodeRes.episodes];
          let currentPage = 2;
          while (episodeRes.nextPageShow === 1) {
            const nextPageRes = await ctx.fetcher<episodeT>('/episodes.php', {
              baseUrl: provider.baseUrl2,
              query: { s: seasonId, series: id, page: currentPage.toString() },
              headers: { cookie: makeCookieHeader({ t_hash_t: hash, hd: 'on' }) },
            });

            episodes = [...episodes, ...nextPageRes.episodes];
            episodeRes.nextPageShow = nextPageRes.nextPageShow;
            currentPage++;
          }

          const episodeId = episodes.find(
            (x) => x.ep === `E${query.episode}` && x.s === `S${query.season}`,
          )?.id;
          if (!episodeId) throw new NotFoundError('Episode not available');

          id = episodeId;
        }

        // Get playlist
        const playlistRes: { sources: { file: string; label: string }[] }[] = await ctx.fetcher('/playlist.php?', {
          baseUrl: provider.baseUrl2,
          query: { id },
          headers: { cookie: makeCookieHeader({ t_hash_t: hash, hd: 'on' }) },
        });

        let autoFile = playlistRes[0].sources.find((source) => source.label === 'Auto')?.file;
        if (!autoFile) {
          autoFile = playlistRes[0].sources.find((source) => source.label === 'Full HD')?.file;
        }
        if (!autoFile) {
          autoFile = playlistRes[0].sources[0].file;
        }

        if (!autoFile) throw new Error('Failed to fetch playlist');

        const playlist = `https://filmueproxy.vercel.app/m3u8-proxy?url=${encodeURIComponent(`${provider.baseUrl}${autoFile}`)}&headers=${encodeURIComponent(JSON.stringify({ referer: provider.baseUrl, cookie: makeCookieHeader({ hd: 'on' }) }))}`;
        
        clearInterval(interval);
        ctx.progress(100);

        return {
          stream: {
            id: 'primary',
            playlist,
            type: 'hls',
            flags: [flags.CORS_ALLOWED],
            captions: [],
          }
        } as EmbedOutput;
      } catch (error) {
        clearInterval(interval);
        ctx.progress(100);
        throw new NotFoundError('Failed to search');
      }
    },
  });
}

export const [netmirrorScraper, primemirrorScraper] = providers.map(embed);
