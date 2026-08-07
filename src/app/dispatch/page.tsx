import type { Metadata } from 'next';
import { fragment, rootStyle } from '@/lib/pageHtml';
import { pageMetadata } from '@/lib/metadata';

export const metadata: Metadata = pageMetadata({
  title: 'The Dispatch — my weekly report on AI + marketing',
  description:
    "One email a week: what's coming, what's working now, and what you can safely ignore. For business owners who sell coaching or services.",
  ogTitle: "One email a week, and you're not behind anymore.",
  path: '/dispatch',
});

export default function DispatchPage() {
  return (
    <div
      className="pg-alt"
      style={rootStyle('dispatch.style.txt')}
      dangerouslySetInnerHTML={{ __html: fragment('dispatch.inner.html') }}
    />
  );
}
