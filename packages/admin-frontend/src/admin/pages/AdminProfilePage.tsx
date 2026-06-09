import { LockOutlined, SaveOutlined, UserOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import type { AdminProfile } from "../../api";
import type { AdminPasswordForm, AdminProfileForm } from "../adminTypes";

const { Text } = Typography;

type AdminProfilePageProps = {
  admin: AdminProfile;
  onChangePassword: () => void;
  onSaveProfile: () => void;
  passwordForm: FormInstance<AdminPasswordForm>;
  profileForm: FormInstance<AdminProfileForm>;
  savingAdminPassword: boolean;
  savingAdminProfile: boolean;
};

export function AdminProfilePage({
  admin,
  onChangePassword,
  onSaveProfile,
  passwordForm,
  profileForm,
  savingAdminPassword,
  savingAdminProfile,
}: AdminProfilePageProps) {
  return (
    <Card
      className="admin-card admin-profile-panel"
      id="admin-profile"
      title={
        <Flex align="center" gap={8}>
          <UserOutlined />
          <span>管理员信息</span>
        </Flex>
      }
    >
      <div className="admin-profile-grid">
        <div className="admin-profile-card">
          <Text strong>账号信息</Text>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="登录账号">
              {admin.account}
            </Descriptions.Item>
            <Descriptions.Item label="上次登录">
              {admin.lastLoginAt ?? "尚未记录"}
            </Descriptions.Item>
          </Descriptions>

          <Form
            className="admin-profile-form"
            form={profileForm}
            layout="vertical"
          >
            <Form.Item
              label="显示名称"
              name="displayName"
              rules={[{ message: "请输入显示名称", required: true }]}
            >
              <Input prefix={<UserOutlined />} />
            </Form.Item>
            <Button
              icon={<SaveOutlined />}
              loading={savingAdminProfile}
              onClick={() => void onSaveProfile()}
              type="primary"
            >
              保存信息
            </Button>
          </Form>
        </div>

        <div className="admin-profile-card">
          <Text strong>修改密码</Text>
          <Form
            className="admin-profile-form"
            form={passwordForm}
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              label="当前密码"
              name="currentPassword"
              rules={[{ message: "请输入当前密码", required: true }]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            <Form.Item
              label="新密码"
              name="newPassword"
              rules={[
                { message: "请输入新密码", required: true },
                { message: "新密码至少 8 位", min: 8 },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            <Form.Item
              dependencies={["newPassword"]}
              label="确认新密码"
              name="confirmPassword"
              rules={[
                { message: "请再次输入新密码", required: true },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("newPassword") === value) {
                      return Promise.resolve();
                    }

                    return Promise.reject(new Error("两次输入的新密码不一致"));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} />
            </Form.Item>
            <Button
              icon={<LockOutlined />}
              loading={savingAdminPassword}
              onClick={() => void onChangePassword()}
              type="primary"
            >
              修改密码
            </Button>
          </Form>
        </div>
      </div>
    </Card>
  );
}
