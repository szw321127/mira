import { Card, Empty } from "antd";

export function MembersPage() {
  return (
    <Card className="admin-card" title="成员管理">
      <Empty description="成员和权限配置待接入" />
    </Card>
  );
}
