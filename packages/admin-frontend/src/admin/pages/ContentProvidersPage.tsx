import {
  DatabaseOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import type {
  AdminContentProviderApiKey,
  AdminContentProviderConfig,
  AdminContentProviderType,
} from "../../api";
import {
  contentProviderLabels,
  contentProviderTypes,
  type ContentProviderApiKeyForm,
  type ContentProviderApiKeyFormState,
  type ContentProviderForm,
  type ContentProviderFormState,
  type ContentProviderState,
} from "../adminTypes";

const { Text } = Typography;

type ContentProvidersPageProps = {
  contentProviderByType: Map<
    AdminContentProviderType,
    AdminContentProviderConfig
  >;
  contentProviderForms: ContentProviderFormState;
  contentProviderLoading: boolean;
  contentProviderState: ContentProviderState;
  creatingProviderApiKey: AdminContentProviderType | null;
  mutatingProviderApiKeyId: string | null;
  onCreateContentProviderApiKey: (type: AdminContentProviderType) => void;
  onDeleteContentProviderApiKey: (
    type: AdminContentProviderType,
    apiKey: AdminContentProviderApiKey,
  ) => void;
  onSaveContentProvider: (type: AdminContentProviderType) => void;
  onToggleContentProviderApiKey: (
    type: AdminContentProviderType,
    apiKey: AdminContentProviderApiKey,
    enabled: boolean,
  ) => void;
  providerApiKeyForms: ContentProviderApiKeyFormState;
  savingContentProvider: AdminContentProviderType | null;
  updateContentProviderApiKeyForm: (
    type: AdminContentProviderType,
    field: keyof ContentProviderApiKeyForm,
    value: string,
  ) => void;
  updateContentProviderForm: (
    type: AdminContentProviderType,
    field: keyof ContentProviderForm,
    value: boolean | string,
  ) => void;
};

export function ContentProvidersPage({
  contentProviderByType,
  contentProviderForms,
  contentProviderLoading,
  contentProviderState,
  creatingProviderApiKey,
  mutatingProviderApiKeyId,
  onCreateContentProviderApiKey,
  onDeleteContentProviderApiKey,
  onSaveContentProvider,
  onToggleContentProviderApiKey,
  providerApiKeyForms,
  savingContentProvider,
  updateContentProviderApiKeyForm,
  updateContentProviderForm,
}: ContentProvidersPageProps) {
  return (
    <>
      {contentProviderState.status === "error" ? (
        <Alert
          description={contentProviderState.errorMessage}
          showIcon
          title="内容来源接口加载失败"
          type="error"
        />
      ) : null}

      <Card
        className="admin-card content-provider-section"
        id="content-providers"
        title={
          <Flex align="center" gap={8} wrap>
            <DatabaseOutlined />
            <span>内容来源</span>
            <Tag>小红书采集服务</Tag>
          </Flex>
        }
      >
        <div className="content-provider-grid">
          {contentProviderTypes.map((type) => {
            const config = contentProviderByType.get(type);
            const apiKeys = config?.apiKeys ?? [];
            const activeRuntimeKeyId = apiKeys.find(
              (apiKey) => apiKey.enabled,
            )?.id;
            const form = contentProviderForms[type];
            const providerApiKeyForm = providerApiKeyForms[type];
            const rateLimit = Number(form.rateLimitPerMinute);
            const rateLimitInvalid =
              form.rateLimitPerMinute.trim() !== "" &&
              (!Number.isInteger(rateLimit) || rateLimit < 1);
            const saveDisabled =
              contentProviderLoading ||
              !form.baseUrl.trim() ||
              !form.name.trim() ||
              rateLimitInvalid;

            return (
              <Card
                className="content-provider-card"
                key={type}
                loading={contentProviderLoading}
                title={contentProviderLabels[type]}
              >
                <div className="provider-status-strip">
                  <div>
                    <Text strong>
                      {form.enabled ? "已启用采集来源" : "未启用采集来源"}
                    </Text>
                    <Text type="secondary">
                      {form.enabled
                        ? "运行时会优先使用已启用的 API Key"
                        : "关闭后不会用于账号或帖子分析"}
                    </Text>
                  </div>
                  <Switch
                    checked={form.enabled}
                    checkedChildren="启用"
                    onChange={(checked) =>
                      updateContentProviderForm(type, "enabled", checked)
                    }
                    unCheckedChildren="停用"
                  />
                </div>

                <div className="content-provider-fields">
                  <label>
                    <Text strong>服务名称</Text>
                    <Input
                      onChange={(event) =>
                        updateContentProviderForm(
                          type,
                          "name",
                          event.target.value,
                        )
                      }
                      placeholder={contentProviderLabels[type]}
                      value={form.name}
                    />
                  </label>
                  <label>
                    <Text strong>Base URL</Text>
                    <Input
                      onChange={(event) =>
                        updateContentProviderForm(
                          type,
                          "baseUrl",
                          event.target.value,
                        )
                      }
                      placeholder="https://api.example.com"
                      value={form.baseUrl}
                    />
                  </label>
                  <label>
                    <Text strong>每分钟限流</Text>
                    <InputNumber
                      min={1}
                      onChange={(value) =>
                        updateContentProviderForm(
                          type,
                          "rateLimitPerMinute",
                          value === null ? "" : String(value),
                        )
                      }
                      placeholder="不填则不限制"
                      status={rateLimitInvalid ? "error" : undefined}
                      value={
                        form.rateLimitPerMinute.trim()
                          ? Number(form.rateLimitPerMinute)
                          : null
                      }
                    />
                  </label>
                  <label>
                    <Text strong>合规备注</Text>
                    <Input.TextArea
                      autoSize={{ maxRows: 4, minRows: 2 }}
                      onChange={(event) =>
                        updateContentProviderForm(
                          type,
                          "complianceNote",
                          event.target.value,
                        )
                      }
                      placeholder="说明该服务只用于用户授权内容或自有样本"
                      value={form.complianceNote}
                    />
                  </label>
                </div>

                <Flex
                  align="center"
                  className="content-provider-footer"
                  gap={10}
                  justify="space-between"
                  wrap
                >
                  <Text type="secondary">
                    {config?.enabled && activeRuntimeKeyId
                      ? "内容分析运行时可用"
                      : "请配置服务并启用至少一个 API Key"}
                  </Text>
                  <Button
                    disabled={saveDisabled}
                    icon={<SaveOutlined />}
                    loading={savingContentProvider === type}
                    onClick={() => void onSaveContentProvider(type)}
                    type="primary"
                  >
                    保存配置
                  </Button>
                </Flex>

                <div className="api-key-panel">
                  <Flex align="center" justify="space-between" wrap>
                    <Text strong>API Key</Text>
                    <Tag>{apiKeys.length} 个</Tag>
                  </Flex>

                  <div className="api-key-create-row">
                    <Input
                      onChange={(event) =>
                        updateContentProviderApiKeyForm(
                          type,
                          "name",
                          event.target.value,
                        )
                      }
                      placeholder="Key 名称，例如：主采集通道"
                      value={providerApiKeyForm.name}
                    />
                    <Input.Password
                      onChange={(event) =>
                        updateContentProviderApiKeyForm(
                          type,
                          "apiKey",
                          event.target.value,
                        )
                      }
                      placeholder="输入新的 API Key"
                      value={providerApiKeyForm.apiKey}
                    />
                    <Button
                      disabled={
                        !providerApiKeyForm.name.trim() ||
                        !providerApiKeyForm.apiKey.trim()
                      }
                      icon={<PlusOutlined />}
                      loading={creatingProviderApiKey === type}
                      onClick={() => void onCreateContentProviderApiKey(type)}
                      type="primary"
                    >
                      新增 API Key
                    </Button>
                  </div>

                  <div className="api-key-list">
                    {apiKeys.length ? (
                      apiKeys.map((apiKey) => (
                        <div className="api-key-item" key={apiKey.id}>
                          <div className="api-key-item-main">
                            <Text strong>{apiKey.name}</Text>
                            {apiKey.id === activeRuntimeKeyId ? (
                              <Tag color="processing">运行使用</Tag>
                            ) : null}
                            <Text code>{apiKey.apiKeyPreview}</Text>
                          </div>
                          <Space size={8}>
                            <Switch
                              checked={apiKey.enabled}
                              checkedChildren="启用"
                              disabled={mutatingProviderApiKeyId === apiKey.id}
                              loading={mutatingProviderApiKeyId === apiKey.id}
                              onChange={(checked) =>
                                void onToggleContentProviderApiKey(
                                  type,
                                  apiKey,
                                  checked,
                                )
                              }
                              unCheckedChildren="停用"
                            />
                            <Popconfirm
                              cancelText="取消"
                              okText="删除"
                              onConfirm={() =>
                                void onDeleteContentProviderApiKey(type, apiKey)
                              }
                              title="删除 API Key"
                            >
                              <Button
                                aria-label={`删除 ${apiKey.name}`}
                                danger
                                disabled={
                                  mutatingProviderApiKeyId === apiKey.id
                                }
                                icon={<DeleteOutlined />}
                              />
                            </Popconfirm>
                          </Space>
                        </div>
                      ))
                    ) : (
                      <Empty
                        description="还没有 API Key"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    )}
                    {apiKeys.length && !activeRuntimeKeyId ? (
                      <Text type="warning">
                        当前没有启用的 API Key，内容分析会失败。
                      </Text>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>
    </>
  );
}
