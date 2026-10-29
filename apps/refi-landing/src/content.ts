import { createContext, useContext } from 'react';
import raw from './generated/content.json';
import variants from './generated/variants.json';

export type TestimonialVideo = { src: string; poster: string; captions: string; source: string; title: string; name: string; approved: boolean };
export type PageContent = Omit<typeof raw, 'testimonials'> & { attributionCampaign?: string; testimonials: Omit<typeof raw.testimonials, 'videos'> & { videos: TestimonialVideo[] } };
export const content = raw as PageContent;
export const pages: PageContent[] = [content, ...variants as PageContent[]];
const PageContext = createContext(content);
export const ContentProvider = PageContext.Provider;
export const useContent = () => useContext(PageContext);
export function pageForPath(path: string): PageContent {
  const normalized = path === '/' ? path : path.replace(/\/$/, '');
  return pages.find(page => page.route === normalized || page.thankYouPath === normalized) || content;
}
