import { Card, Empty, Table } from "antd";
import type { TableProps } from "antd";
import type { AdminTask as Task } from "../../api";

type TasksPageProps = {
  dashboardLoading: boolean;
  filteredTasks: Task[];
  taskColumns: TableProps<Task>["columns"];
};

export function TasksPage({
  dashboardLoading,
  filteredTasks,
  taskColumns,
}: TasksPageProps) {
  return (
    <Card className="admin-card" id="task-board" title="任务看板">
      <div className="table-scroll">
        <Table
          columns={taskColumns}
          dataSource={filteredTasks}
          locale={{ emptyText: <Empty description="没有匹配的任务" /> }}
          loading={dashboardLoading}
          pagination={false}
          rowKey="key"
          size="middle"
        />
      </div>
    </Card>
  );
}
