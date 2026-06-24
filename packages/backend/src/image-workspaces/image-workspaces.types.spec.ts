import {
  parseCanvasSnapshot,
  parseImageTaskRequest,
  parseWorkspaceTitle,
  serializeImageWorkspace
} from "./image-workspaces.types.js";

describe("image workspace parsers", () => {
  it("trims workspace titles and rejects empty titles", () => {
    expect(parseWorkspaceTitle({ title: "  Launch board  " })).toBe(
      "Launch board"
    );
    expect(parseWorkspaceTitle({ title: "   " })).toBeNull();
    expect(parseWorkspaceTitle({})).toBeNull();
  });

  it("parses canvas snapshots with finite object geometry", () => {
    expect(
      parseCanvasSnapshot({
        viewport: { x: 12, y: -8, zoom: 1.2 },
        objects: [
          {
            id: "object-1",
            assetId: "asset-1",
            type: "image",
            x: 10,
            y: 20,
            width: 320,
            height: 240,
            rotation: 3,
            zIndex: 2,
            props: { label: "cover" }
          }
        ]
      })
    ).toEqual({
      viewport: { x: 12, y: -8, zoom: 1.2 },
      objects: [
        {
          id: "object-1",
          assetId: "asset-1",
          type: "image",
          x: 10,
          y: 20,
          width: 320,
          height: 240,
          rotation: 3,
          zIndex: 2,
          props: { label: "cover" }
        }
      ]
    });
  });

  it("rejects invalid canvas snapshots", () => {
    expect(
      parseCanvasSnapshot({
        objects: [{ id: "bad", type: "image", x: Number.NaN }]
      })
    ).toBeNull();
    expect(parseCanvasSnapshot({ objects: "not-array" })).toBeNull();
  });

  it("parses generate task requests", () => {
    expect(
      parseImageTaskRequest({
        type: "generate",
        prompt: "make a cover",
        target: { x: 100, y: 120 },
        aspectRatio: "16:9",
        quality: "high",
        background: "transparent"
      })
    ).toEqual({
      type: "generate",
      prompt: "make a cover",
      target: { x: 100, y: 120 },
      aspectRatio: "16:9",
      quality: "high",
      background: "transparent"
    });
  });

  it("accepts valid image expand task requests", () => {
    expect(
      parseImageTaskRequest({
        type: "expand",
        prompt: "extend the street",
        assetId: "asset-1",
        versionId: "version-1",
        mode: "direction",
        direction: "right",
        percent: 0.25,
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 },
        aspectRatio: "16:9"
      })
    ).toEqual({
      type: "expand",
      prompt: "extend the street",
      assetId: "asset-1",
      versionId: "version-1",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      expandTarget: { width: 1280, height: 1024 },
      aspectRatio: "16:9"
    });
  });

  it("rejects invalid image expand task payloads", () => {
    expect(
      parseImageTaskRequest({
        type: "expand",
        prompt: "extend",
        assetId: "asset-1",
        versionId: "version-1",
        mode: "free",
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        target: { width: 1024, height: 1024 }
      })
    ).toBeNull();

    expect(
      parseImageTaskRequest({
        type: "expand",
        prompt: "extend",
        assetId: "asset-1",
        versionId: "version-1",
        mode: "direction",
        direction: "diagonal",
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 }
      })
    ).toBeNull();
  });

  it("rejects unsupported generate task settings", () => {
    expect(
      parseImageTaskRequest({
        type: "generate",
        prompt: "make a cover",
        size: "2048x2048"
      })
    ).toBeNull();
    expect(
      parseImageTaskRequest({
        type: "generate",
        prompt: "make a cover",
        aspectRatio: "21:9"
      })
    ).toBeNull();
    expect(
      parseImageTaskRequest({
        type: "generate",
        prompt: "make a cover",
        quality: "ultra"
      })
    ).toBeNull();
    expect(
      parseImageTaskRequest({
        type: "generate",
        prompt: "make a cover",
        background: "neon"
      })
    ).toBeNull();
  });

  it("rejects empty prompts and unsupported task types", () => {
    expect(parseImageTaskRequest({ type: "generate", prompt: " " })).toBeNull();
    expect(parseImageTaskRequest({ type: "unknown", prompt: "cover" })).toBeNull();
  });

  it("serializes nullable canvas object props from the database as an empty object", () => {
    const date = new Date("2026-06-23T09:00:00.000Z");

    expect(
      serializeImageWorkspace({
        id: "workspace-1",
        userId: "user-1",
        title: "Board",
        status: "active",
        viewport: null,
        createdAt: date,
        updatedAt: date,
        deletedAt: null,
        objects: [
          {
            id: "object-1",
            workspaceId: "workspace-1",
            assetId: null,
            type: "image",
            x: 0,
            y: 0,
            width: 320,
            height: 240,
            rotation: 0,
            zIndex: 1,
            props: null,
            createdAt: date,
            updatedAt: date
          }
        ],
        assets: [],
        tasks: []
      })
    ).toEqual(
      expect.objectContaining({
        objects: [
          expect.objectContaining({
            id: "object-1",
            props: {}
          })
        ]
      })
    );
  });

  it("does not expose raw image version internals in public workspace serialization", () => {
    const date = new Date("2026-06-23T09:00:00.000Z");
    const workspace = serializeImageWorkspace({
      id: "workspace-1",
      userId: "user-1",
      title: "Board",
      status: "active",
      viewport: null,
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      objects: [],
      assets: [
        {
          id: "asset-1",
          workspaceId: "workspace-1",
          userId: "user-1",
          currentVersionId: "version-1",
          title: "Hero",
          prompt: "source prompt",
          metadata: {},
          createdAt: date,
          updatedAt: date,
          versions: [
            {
              id: "version-1",
              assetId: "asset-1",
              parentId: null,
              storageKey: "local/user/workspace/task/version-1.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
              sizeBytes: 128,
              prompt: "source prompt",
              editPrompt: null,
              maskKey: "local/user/workspace/mask.png",
              provider: "openai",
              providerJob: "job-1",
              metadata: {},
              createdAt: date
            }
          ]
        }
      ],
      tasks: []
    });

    const version = workspace.assets[0]?.versions[0] as Record<string, unknown>;
    expect(version).toEqual(
      expect.objectContaining({
        id: "version-1",
        assetId: "asset-1",
        mimeType: "image/png",
        width: 1024,
        height: 1024
      })
    );
    expect(version).not.toHaveProperty("storageKey");
    expect(version).not.toHaveProperty("maskKey");
    expect(version).not.toHaveProperty("providerJob");
    expect(JSON.stringify(workspace)).not.toContain("job-1");
    expect(JSON.stringify(workspace)).not.toContain("local/user/workspace");
  });

  it("sanitizes image task input and output in public workspace serialization", () => {
    const date = new Date("2026-06-23T09:00:00.000Z");
    const workspace = serializeImageWorkspace({
      id: "workspace-1",
      userId: "user-1",
      title: "Board",
      status: "active",
      viewport: null,
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      objects: [],
      assets: [],
      tasks: [
        {
          id: "task-1",
          workspaceId: "workspace-1",
          userId: "user-1",
          type: "edit",
          status: "complete",
          input: {
            prompt: "make a softer cover",
            assetId: "asset-1",
            versionId: "version-1",
            maskKey: "local/user/workspace/masks/mask.png",
            storageKey: "local/user/workspace/source.png",
            providerJob: "job-input",
            aspectRatio: "16:9",
            size: "1024x1024",
            quality: "high",
            background: "transparent"
          },
          output: {
            assetId: "asset-1",
            versionId: "version-2",
            storageKey: "local/user/workspace/output.png",
            providerJob: "job-output"
          },
          error: null,
          cost: {
            provider: "openai",
            estimatedCostUsd: 0.04
          },
          createdAt: date,
          startedAt: date,
          finishedAt: date
        }
      ]
    });

    const task = workspace.tasks[0] as Record<string, unknown>;
    expect(task.input).toEqual({
      prompt: "make a softer cover",
      assetId: "asset-1",
      versionId: "version-1",
      aspectRatio: "16:9",
      size: "1024x1024",
      quality: "high",
      background: "transparent"
    });
    expect(task.output).toEqual({
      assetId: "asset-1",
      versionId: "version-2"
    });
    expect(JSON.stringify(workspace)).not.toContain("maskKey");
    expect(JSON.stringify(workspace)).not.toContain("storageKey");
    expect(JSON.stringify(workspace)).not.toContain("providerJob");
    expect(JSON.stringify(workspace)).not.toContain("local/user/workspace");
    expect(JSON.stringify(workspace)).not.toContain("job-output");
  });
});
