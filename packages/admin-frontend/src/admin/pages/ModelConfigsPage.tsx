import {
  DeleteOutlined,
  KeyOutlined,
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
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import type {
  AdminModelApiKey,
  AdminModelConfig,
  AdminModelConfigType,
} from "../../api";
import {
  modelConfigLabels,
  modelConfigTypes,
  type ModelApiKeyForm,
  type ModelApiKeyFormState,
  type ModelConfigForm,
  type ModelConfigFormState,
  type ModelConfigState,
} from "../adminTypes";

const { Text } = Typography;

type ModelConfigsPageProps = {
  creatingApiKey: AdminModelConfigType | null;
  modelApiKeyForms: ModelApiKeyFormState;
  modelConfigByType: Map<AdminModelConfigType, AdminModelConfig>;
  modelConfigForms: ModelConfigFormState;
  modelConfigLoading: boolean;
  modelConfigState: ModelConfigState;
  mutatingApiKeyId: string | null;
  onCreateModelApiKey: (type: AdminModelConfigType) => void;
  onDeleteModelApiKey: (
    type: AdminModelConfigType,
    apiKey: AdminModelApiKey,
  ) => void;
  onSaveModelConfig: (type: AdminModelConfigType) => void;
  onToggleModelApiKey: (
    type: AdminModelConfigType,
    apiKey: AdminModelApiKey,
    enabled: boolean,
  ) => void;
  savingModelConfig: AdminModelConfigType | null;
  updateModelApiKeyForm: (
    type: AdminModelConfigType,
    field: keyof ModelApiKeyForm,
    value: string,
  ) => void;
  updateModelConfigForm: (
    type: AdminModelConfigType,
    field: keyof ModelConfigForm,
    value: string,
  ) => void;
};

export function ModelConfigsPage({
  creatingApiKey,
  modelApiKeyForms,
  modelConfigByType,
  modelConfigForms,
  modelConfigLoading,
  modelConfigState,
  mutatingApiKeyId,
  onCreateModelApiKey,
  onDeleteModelApiKey,
  onSaveModelConfig,
  onToggleModelApiKey,
  savingModelConfig,
  updateModelApiKeyForm,
  updateModelConfigForm,
}: ModelConfigsPageProps) {
  return (
    <>
      {modelConfigState.status === "error" ? (
        <Alert
          description={modelConfigState.errorMessage}
          showIcon
          title="模型配置接口加载失败"
          type="error"
        />
      ) : null}

      <Card
        className="admin-card model-config-section"
        id="model-configs"
        title={
          <Flex align="center" gap={8} wrap>
            <KeyOutlined />
            <span>模型配置</span>
            <Tag>API Key 不明文回显</Tag>
          </Flex>
        }
      >
        <div className="model-config-grid">
          {modelConfigTypes.map((type) => {
            const config = modelConfigByType.get(type);
            const apiKeys = config?.apiKeys ?? [];
            const activeRuntimeKeyId = apiKeys.find(
              (apiKey) => apiKey.enabled,
            )?.id;
            const form = modelConfigForms[type];
            const saveDisabled =
              modelConfigLoading ||
              !form.baseUrl.trim() ||
              !form.modelName.trim();

            return (
              <Card
                className="model-config-card"
                key={type}
                loading={modelConfigLoading}
                title={modelConfigLabels[type]}
              >
                <div className="model-config-fields">
                  <label>
                    <Text strong>Base URL</Text>
                    <Input
                      onChange={(event) =>
                        updateModelConfigForm(
                          type,
                          "baseUrl",
                          event.target.value,
                        )
                      }
                      placeholder="https://api.example.com/v1"
                      value={form.baseUrl}
                    />
                  </label>
                  <label>
                    <Text strong>模型名称</Text>
                    <Input
                      onChange={(event) =>
                        updateModelConfigForm(
                          type,
                          "modelName",
                          event.target.value,
                        )
                      }
                      placeholder={
                        type === "text" ? "gpt-4.1-mini" : "gpt-image-1"
                      }
                      value={form.modelName}
                    />
                  </label>
                </div>

                <Flex
                  align="center"
                  className="model-config-footer"
                  gap={10}
                  justify="space-between"
                  wrap
                >
                  <Text type="secondary">
                    {config?.baseUrl && config?.modelName
                      ? "模型连接信息已配置"
                      : "请先配置模型连接信息"}
                  </Text>
                  <Button
                    disabled={saveDisabled}
                    icon={<SaveOutlined />}
                    loading={savingModelConfig === type}
                    onClick={() => void onSaveModelConfig(type)}
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
                        updateModelApiKeyForm(type, "name", event.target.value)
                      }
                      placeholder="Key 名称，例如：主账号"
                      value={modelApiKeyForms[type].name}
                    />
                    <Input.Password
                      onChange={(event) =>
                        updateModelApiKeyForm(
                          type,
                          "apiKey",
                          event.target.value,
                        )
                      }
                      placeholder="输入新的 API Key"
                      value={modelApiKeyForms[type].apiKey}
                    />
                    <Button
                      disabled={
                        !modelApiKeyForms[type].name.trim() ||
                        !modelApiKeyForms[type].apiKey.trim()
                      }
                      icon={<PlusOutlined />}
                      loading={creatingApiKey === type}
                      onClick={() => void onCreateModelApiKey(type)}
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
                              disabled={mutatingApiKeyId === apiKey.id}
                              loading={mutatingApiKeyId === apiKey.id}
                              onChange={(checked) =>
                                void onToggleModelApiKey(type, apiKey, checked)
                              }
                              unCheckedChildren="停用"
                            />
                            <Popconfirm
                              cancelText="取消"
                              okText="删除"
                              onConfirm={() =>
                                void onDeleteModelApiKey(type, apiKey)
                              }
                              title="删除 API Key"
                            >
                              <Button
                                aria-label={`删除 ${apiKey.name}`}
                                danger
                                disabled={mutatingApiKeyId === apiKey.id}
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
                        当前没有启用的 API Key，模型调用会失败。
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
