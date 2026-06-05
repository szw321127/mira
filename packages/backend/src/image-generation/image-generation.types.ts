export type ImageGenerationInput = {
  coverLine: string;
  imagePrompt: string;
  postDraftId: string;
  tags: string[];
  title: string;
  topic: string;
};

export type ImageGenerationResult = {
  generatedAt: Date;
  imageUrl: string;
  provider: string;
};

export interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
