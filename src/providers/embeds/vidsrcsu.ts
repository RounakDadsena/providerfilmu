import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';

const providers = [
  {
    id: 'server-7',
    rank: 102,
  },
  {
    id: 'server-11',
    rank: 92,
  },
  {
    id: 'server-10',
    rank: 82,
  },
  {
    id: 'server-1',
    rank: 72,
  },
  {
    id: 'server-3',
    rank: 62,
  },
  {
    id: 'server-2',
    rank: 52,
  },
  {
    id: 'server-4',
    rank: 42,
  },
  {
    id: 'server-5',
    rank: 32,
  },
  {
    id: 'server-6',
    rank: 22,
  },
  {
    id: 'server-8',
    rank: 12,
  },
  {
    id: 'server-9',
    rank: 6,
  },
  {
    id: 'server-12',
    rank: 3,
  },
  {
    id: 'server-20',
    rank: 1,
    name: 'Cineby',
  },
];

function embed(provider: { id: string; rank: number; name?: string; disabled?: boolean }) {
  return makeEmbed({
    id: provider.id,
    name:
      provider.name ||
      provider.id
        .split('-')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' '),
    disabled: provider.disabled,
    rank: provider.rank,
    async scrape(ctx) {
      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: ctx.url,
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
      };
    },
  });
}

export const [
  VidsrcsuServer1Scraper,
  VidsrcsuServer2Scraper,
  VidsrcsuServer3Scraper,
  VidsrcsuServer4Scraper,
  VidsrcsuServer5Scraper,
  VidsrcsuServer6Scraper,
  VidsrcsuServer7Scraper,
  VidsrcsuServer8Scraper,
  VidsrcsuServer9Scraper,
  VidsrcsuServer10Scraper,
  VidsrcsuServer11Scraper,
  VidsrcsuServer12Scraper,
  VidsrcsuServer20Scraper,
] = providers.map(embed);
