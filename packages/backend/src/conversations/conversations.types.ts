export type BackendPostDraftView = {
  caption: string;
  conversationId: string;
  coverLine: string;
  createdAt: Date;
  id: string;
  imageError: string | null;
  imageGeneratedAt: Date | null;
  imagePrompt: string;
  imageProvider: string | null;
  imageStatus: string;
  imageUrl: string | null;
  outlineId: string | null;
  sections: string[];
  stale: boolean;
  tags: string[];
  title: string;
  updatedAt: Date;
};
