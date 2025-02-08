import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

import { Caption } from '../captions';

// Thanks Nemo, Custom, and Roomba for this API
const BASE_URL = 'https://febapi.bludclart.com';

// this is so fucking useless
const languageMap: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Arabic: 'ar',
  Russian: 'ru',
  Japanese: 'ja',
  Korean: 'ko',
  Chinese: 'zh',
  Hindi: 'hi',
  Turkish: 'tr',
  Dutch: 'nl',
  Polish: 'pl',
  Swedish: 'sv',
  Indonesian: 'id',
  Thai: 'th',
  Vietnamese: 'vi',
};

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const apiUrl =
    ctx.media.type === 'movie'
      ? `${BASE_URL}/movie/${ctx.media.tmdbId}`
      : `${BASE_URL}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

  const data = await ctx.fetcher(apiUrl);
  if (data?.error === 'No quality list in FebBox response') {
    throw new NotFoundError('No stream found');
  }
  if (!data) throw new NotFoundError('No response from API');
  ctx.progress(50);

  const streams = Object.entries(data.streams.qualities).reduce((acc: Record<string, string>, [quality, url]) => {
    let qualityKey: number;
    if (quality === '4K') {
      qualityKey = 2160;
    } else if (quality === 'ORG') {
      return acc;
    } else {
      qualityKey = parseInt(quality.replace('P', ''), 10);
    }
    if (Number.isNaN(qualityKey) || acc[qualityKey]) return acc;
    acc[qualityKey] = url as string;
    return acc;
  }, {});

  const captions: Caption[] = [];
  for (const [langKey, subs] of Object.entries(data.subtitles)) {
    const languageName = langKey.replace(' Subtitles', '');
    const languageCode = languageMap[languageName]?.toLowerCase() || 'unknown';

    for (const sub of subs as any[]) {
      const url = sub['Subtitle Link'];
      const isVtt = url.toLowerCase().endsWith('.vtt');
      captions.push({
        type: isVtt ? 'vtt' : 'srt',
        id: url,
        url,
        language: languageCode,
        hasCorsRestrictions: false,
      });
    }
  }

  ctx.progress(90);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        captions,
        qualities: {
          ...(streams[2160] && {
            '4k': {
              type: 'mp4',
              url: streams[2160],
            },
          }),
          ...(streams[1080] && {
            1080: {
              type: 'mp4',
              url: streams[1080],
            },
          }),
          ...(streams[720] && {
            720: {
              type: 'mp4',
              url: streams[720],
            },
          }),
          ...(streams[480] && {
            480: {
              type: 'mp4',
              url: streams[480],
            },
          }),
          ...(streams[360] && {
            360: {
              type: 'mp4',
              url: streams[360],
            },
          }),
        },
        type: 'file',
        flags: [flags.CORS_ALLOWED],
      },
    ],
  };
}

export const FedAPIScraper = makeSourcerer({
  id: 'fedapi',
  name: 'FED API',
  rank: 119,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
