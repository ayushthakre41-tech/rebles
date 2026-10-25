/**
 * Luma event page scraper with automatic mock fallback.
 * 
 * Per FR-7/FR-8: if login/CAPTCHA blocks access, we stop and fall back to mock.
 * We never attempt to bypass auth controls.
 */

import * as cheerio from 'cheerio';

export interface ScrapedEventData {
  title?: string;
  date?: string;
  venue?: string;
  registeredCount?: number;
  waitlistedCount?: number;
  publicUrl?: string;
  scrapedAt: string;
  source: 'live' | 'mock' | 'blocked';
  blockReason?: string;
  rawHtml?: string;
}

export interface ScrapeResult {
  data: ScrapedEventData;
  evidence: Array<{
    field: string;
    value: string;
    sourceUrl: string;
    retrievedAt: string;
  }>;
}

/**
 * Try to fetch and parse a Luma event page. Falls back to mock on any error.
 */
export async function scrapeLumaEvent(publicUrl: string): Promise<ScrapeResult> {
  const retrievedAt = new Date().toISOString();

  // Only attempt scraping for lu.ma URLs
  if (!publicUrl || !publicUrl.includes('lu.ma')) {
    return buildMockResult(publicUrl, retrievedAt, 'Not a lu.ma URL — using mock data');
  }

  try {
    const res = await fetch(publicUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EventRegistrationManager/1.0; +https://github.com/event-registration-manager)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return buildMockResult(
        publicUrl,
        retrievedAt,
        `Platform returned ${res.status} — login or access control required. Manual step needed (FR-7). Using mock.`
      );
    }

    if (res.status === 429) {
      return buildMockResult(
        publicUrl,
        retrievedAt,
        'Platform rate-limited the request. Using mock fallback.'
      );
    }

    if (!res.ok) {
      return buildMockResult(
        publicUrl,
        retrievedAt,
        `HTTP ${res.status} from platform. Using mock fallback.`
      );
    }

    const html = await res.text();
    return parseLumaHtml(html, publicUrl, retrievedAt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return buildMockResult(publicUrl, retrievedAt, `Fetch error: ${msg}. Using mock fallback.`);
  }
}

function parseLumaHtml(html: string, sourceUrl: string, retrievedAt: string): ScrapeResult {
  const $ = cheerio.load(html);

  // Selectors isolated here so they're easy to update if Luma changes markup
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    undefined;

  const dateRaw =
    $('meta[property="event:start_time"]').attr('content') ||
    $('[data-testid="event-date"]').text().trim() ||
    $('time').first().attr('datetime') ||
    undefined;

  const venue =
    $('meta[property="og:locality"]').attr('content') ||
    $('[data-testid="event-location"]').text().trim() ||
    undefined;

  // Luma doesn't expose attendee counts on the public page, so these are UNCERTAIN
  const data: ScrapedEventData = {
    title,
    date: dateRaw,
    venue,
    registeredCount: undefined, // not available on public page
    waitlistedCount: undefined,
    publicUrl: sourceUrl,
    scrapedAt: retrievedAt,
    source: 'live',
  };

  const evidence = buildEvidence(data, sourceUrl, retrievedAt);

  return { data, evidence };
}

function buildMockResult(sourceUrl: string, retrievedAt: string, blockReason: string): ScrapeResult {
  const data: ScrapedEventData = {
    title: '[MOCK] Community Tech Meetup',
    date: '2026-11-15',
    venue: '[MOCK] TechHub, Floor 3, 22 Silicon Street',
    registeredCount: 18,
    waitlistedCount: 3,
    publicUrl: sourceUrl || 'https://lu.ma/mock-event',
    scrapedAt: retrievedAt,
    source: 'mock',
    blockReason,
  };

  const evidence = buildEvidence(data, sourceUrl || 'mock://local', retrievedAt);
  return { data, evidence };
}

function buildEvidence(
  data: ScrapedEventData,
  sourceUrl: string,
  retrievedAt: string
): ScrapeResult['evidence'] {
  const fields: Array<[string, string | number | undefined]> = [
    ['title', data.title],
    ['date', data.date],
    ['venue', data.venue],
    ['registeredCount', data.registeredCount],
    ['waitlistedCount', data.waitlistedCount],
    ['source', data.source],
    ['blockReason', data.blockReason],
  ];

  return fields
    .filter(([, v]) => v !== undefined)
    .map(([field, value]) => ({
      field,
      value: String(value),
      sourceUrl,
      retrievedAt,
    }));
}
