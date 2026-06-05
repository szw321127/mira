export type OutlineTone = 'checklist' | 'guide' | 'story';

export type GeneratedOutline = {
  hook: string;
  label: string;
  points: string[];
  title: string;
  tone: OutlineTone;
};

export type OutlineForDraft = GeneratedOutline & {
  id: string;
};

export type GeneratedPostDraft = {
  caption: string;
  coverLine: string;
  imagePrompt: string;
  sections: string[];
  tags: string[];
  title: string;
};
