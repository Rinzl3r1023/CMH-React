// Injects a pre-cleaned static HTML fragment (ported verbatim from a v6 export)
// without adding a layout box of its own — display:contents removes the wrapper
// from the box tree, so the fragment's nodes render as direct children of the
// page root. Used to interleave static sections with React data islands on the
// Blog and Show pages.
export default function HtmlFragment({ html }: { html: string }) {
  return <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: html }} />;
}
