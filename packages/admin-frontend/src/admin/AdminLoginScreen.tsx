import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Spin, Typography } from "antd";
import { useState } from "react";
import { getApiErrorMessage, type AdminLoginInput } from "../api";

const { Text, Title } = Typography;

type AdminLoginScreenProps = {
  checking: boolean;
  onLogin: (values: AdminLoginInput) => Promise<void>;
};

export function AdminLoginScreen({ checking, onLogin }: AdminLoginScreenProps) {
  const [loginForm] = Form.useForm<AdminLoginInput>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const handleFinish = async (values: AdminLoginInput) => {
    setErrorMessage(null);
    setLoggingIn(true);

    try {
      await onLogin(values);
      loginForm.resetFields(["password"]);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="admin-login-shell">
      <Card className="admin-login-card">
        <div className="admin-login-mark">R</div>
        <Title level={3}>管理员登录</Title>
        <Text className="admin-login-product">RedNote 后台项目管理</Text>

        {checking ? (
          <div className="admin-login-checking">
            <Spin />
            <Text type="secondary">正在恢复登录</Text>
          </div>
        ) : (
          <Form
            form={loginForm}
            initialValues={{ account: "admin" }}
            layout="vertical"
            onFinish={(values) => void handleFinish(values)}
            requiredMark={false}
          >
            {errorMessage ? (
              <Alert
                className="admin-login-error"
                showIcon
                title={errorMessage}
                type="error"
              />
            ) : null}

            <Form.Item
              label="账号"
              name="account"
              rules={[{ message: "请输入管理员账号", required: true }]}
            >
              <Input prefix={<UserOutlined />} />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ message: "请输入管理员密码", required: true }]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            <Button block htmlType="submit" loading={loggingIn} type="primary">
              登录
            </Button>
            <Text className="admin-login-default" type="secondary">
              初始：admin / Rednote@123456
            </Text>
          </Form>
        )}
      </Card>
    </div>
  );
}
