// BreadcrumbList (§4.5). Crumb URLs must point at REAL routes — posts live at
// root-level slugs and the "The Show" crumb points to /blog; there is no
// /blog/<slug> hierarchy to invent.
export function breadcrumbNode(
  url: string,
  crumbs: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}
