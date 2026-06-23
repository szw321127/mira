import { Test } from "@nestjs/testing";
import { jest } from "@jest/globals";
import { AdminStore } from "../admin/admin-store.js";
import { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ImageWorkspacesModule } from "./image-workspaces.module.js";

describe("ImageWorkspacesModule", () => {
  it("compiles with the real Nest provider graph", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ImageWorkspacesModule]
    })
      .overrideProvider(PrismaService)
      .useValue(createPrismaStub())
      .overrideProvider(AdminStore)
      .useValue({})
      .overrideProvider(RuntimeSecretsService)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});

function createPrismaStub() {
  return {
    $connect: jest.fn(),
    $disconnect: jest.fn()
  } as unknown as PrismaService;
}
