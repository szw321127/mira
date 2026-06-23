import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { IMAGE_PROVIDER } from "./image-provider.types.js";
import {
  ConfiguredImageStorageService,
  createLocalImageStorageService,
  IMAGE_STORAGE
} from "./image-storage.service.js";
import { ImageAssetsController } from "./image-assets.controller.js";
import { ImageAssetsService } from "./image-assets.service.js";
import { ImageAgentService } from "./image-agent.service.js";
import { ImageQueueService } from "./image-queue.service.js";
import { ImageTaskStreamController } from "./image-task-stream.controller.js";
import { ImageUsageService } from "./image-usage.service.js";
import { ImageWorkerService } from "./image-worker.service.js";
import { ImageWorkspacesController } from "./image-workspaces.controller.js";
import { ImageWorkspacesService } from "./image-workspaces.service.js";
import { LocalImageStorageService } from "./local-image-storage.service.js";
import { OpenAIImageProviderService } from "./openai-image-provider.service.js";

@Module({
  imports: [DatabaseModule, AuthModule, AdminModule],
  controllers: [
    ImageWorkspacesController,
    ImageTaskStreamController,
    ImageAssetsController
  ],
  providers: [
    ImageWorkspacesService,
    ImageAssetsService,
    ImageAgentService,
    ImageUsageService,
    ImageQueueService,
    ImageWorkerService,
    {
      provide: LocalImageStorageService,
      useFactory: createLocalImageStorageService
    },
    ConfiguredImageStorageService,
    OpenAIImageProviderService,
    {
      provide: IMAGE_PROVIDER,
      useExisting: OpenAIImageProviderService
    },
    {
      provide: IMAGE_STORAGE,
      useExisting: ConfiguredImageStorageService
    }
  ],
  exports: [
    ImageWorkspacesService,
    ImageAssetsService,
    ImageAgentService,
    ImageUsageService,
    ImageQueueService,
    ImageWorkerService,
    IMAGE_PROVIDER,
    IMAGE_STORAGE
  ]
})
export class ImageWorkspacesModule {}
