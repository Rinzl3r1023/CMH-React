import { WEBSITE_ID, PERSON_ID, HOME_URL, SITE_NAME } from './config';

// WebSite (§2.3). NO SearchAction — the site has no search function, and declaring
// one that doesn't exist is a false machine-readable claim (the honest-scales rule).
export function websiteNode(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: HOME_URL,
    name: SITE_NAME,
    publisher: { '@id': PERSON_ID },
    inLanguage: 'en-US',
  };
}
