import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareTitle } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';

// thanks @TPN for this

const baseUrl = 'https://iosmirror.cc';
const baseUrl2 = 'https://vercelhlsproxy-nn5c.vercel.app/iosmirror.cc:443';

type metaT = {
  year: string;
  type: 'm' | 't';
  season: { s: string; id: string; ep: string }[];
};

type searchT = { status: 'y' | 'n'; searchResult?: { id: string; t: string }[]; error: string };

type episodeT = { episodes: { id: string; s: string; ep: string }[]; nextPageShow: number };

const universalScraper = async (ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> => {
  const hash = decodeURIComponent(await ctx.proxiedFetcher('https://netmirror-temp.tpn.workers.dev/'));

  const searchRes = await ctx.proxiedFetcher<searchT>('/search.php', {
    baseUrl: baseUrl2,
    query: { s: ctx.media.title },
    headers: { cookie: makeCookieHeader({ t_hash_t: hash }) },
  });
  if (searchRes.status !== 'y' || !searchRes.searchResult) throw new NotFoundError(searchRes.error);

  async function getMeta(id: string) {
    return ctx.proxiedFetcher<metaT>('/post.php', {
      baseUrl: baseUrl2,
      query: { id },
      headers: { cookie: makeCookieHeader({ t_hash_t: hash }) },
    });
  }

  let metaRes: metaT | undefined;

  // todo: use promise.alp
  let id = searchRes.searchResult.find(async (x) => {
    metaRes = await getMeta(x.id);
    return (
      compareTitle(x.t, ctx.media.title) &&
      (Number(metaRes.year) === ctx.media.releaseYear || metaRes.type === (ctx.media.type === 'movie' ? 'm' : 't'))
    );
  })?.id;
  if (!id) throw new NotFoundError('No watchable item found');

  if (ctx.media.type === 'show') {
    metaRes = await getMeta(id); // shouldnt need this, idunno why it doesnt work without this
    const showMedia = ctx.media;

    const seasonId = metaRes?.season.find((x) => Number(x.s) === showMedia.season.number)?.id;
    if (!seasonId) throw new NotFoundError('Season not available');

    const episodeRes = await ctx.proxiedFetcher<episodeT>('/episodes.php', {
      baseUrl: baseUrl2,
      query: { s: seasonId, series: id },
      headers: { cookie: makeCookieHeader({ t_hash_t: hash }) },
    });

    let episodes = [...episodeRes.episodes];
    let currentPage = 2;
    while (episodeRes.nextPageShow === 1) {
      const nextPageRes = await ctx.proxiedFetcher<episodeT>('/episodes.php', {
        baseUrl: baseUrl2,
        query: { s: seasonId, series: id, page: currentPage.toString() },
        headers: { cookie: makeCookieHeader({ t_hash_t: hash }) },
      });

      episodes = [...episodes, ...nextPageRes.episodes];
      episodeRes.nextPageShow = nextPageRes.nextPageShow;
      currentPage++;
    }

    const episodeId = episodes.find(
      (x) => x.ep === `E${showMedia.episode.number}` && x.s === `S${showMedia.season.number}`,
    )?.id;
    if (!episodeId) throw new NotFoundError('Episode not available');

    id = episodeId;
  }

  const playlistRes: { sources: { file: string }[] }[] = await ctx.proxiedFetcher('/playlist.php?', {
    baseUrl: baseUrl2,
    query: { id },
    headers: { cookie: makeCookieHeader({ t_hash_t: hash }) },
  });

  if (!playlistRes[0].sources[0].file) throw new Error('Failed to fetch playlist'); // todo: make a find func to get the one with lable auto

  const playlist = `https://vercelhlsproxy-nn5c.vercel.app/m3u8-proxy?url=${encodeURIComponent(`${baseUrl}${playlistRes[0].sources[0].file}`)}&headers=${encodeURIComponent(JSON.stringify({ referer: baseUrl }))}`;

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        playlist,
        type: 'hls',
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
  };
};

export const iosmirrorScraper = makeSourcerer({
  id: 'iosmirror',
  name: 'NetMirror',
  rank: 122,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});
