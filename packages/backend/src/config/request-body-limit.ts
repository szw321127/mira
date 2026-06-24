import type { INestApplication } from "@nestjs/common";
import express from "express";

export const SOURCE_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const REQUEST_BODY_LIMIT_BYTES = 32 * 1024 * 1024;
export const REQUEST_BODY_LIMIT = `${REQUEST_BODY_LIMIT_BYTES}b`;

export function configureRequestBodyLimit(app: INestApplication): void {
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
}
