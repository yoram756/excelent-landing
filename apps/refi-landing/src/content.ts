import raw from './generated/content.json';

export type TestimonialVideo = { src: string; poster: string; captions: string; source: string; title: string; name: string; approved: boolean };
export const content = raw as Omit<typeof raw, 'testimonials'> & { testimonials: Omit<typeof raw.testimonials, 'videos'> & { videos: TestimonialVideo[] } };
