import {
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Table,
} from "antd";
import type { FormInstance, TableProps } from "antd";
import type {
  AdminDashboard,
  AdminProject as Project,
  AdminProjectStatus as ProjectStatus,
} from "../../api";
import type { CreateProjectForm } from "../adminTypes";

type ProjectsPageProps = {
  capabilities: AdminDashboard["capabilities"];
  createProjectForm: FormInstance<CreateProjectForm>;
  createProjectOpen: boolean;
  creatingProject: boolean;
  dashboardLoading: boolean;
  filteredProjects: Project[];
  onCreateProject: () => void;
  projectColumns: TableProps<Project>["columns"];
  setCreateProjectOpen: (open: boolean) => void;
  setStatusFilter: (status: ProjectStatus | "全部") => void;
  statusFilter: ProjectStatus | "全部";
};

export function ProjectsPage({
  capabilities,
  createProjectForm,
  createProjectOpen,
  creatingProject,
  dashboardLoading,
  filteredProjects,
  onCreateProject,
  projectColumns,
  setCreateProjectOpen,
  setStatusFilter,
  statusFilter,
}: ProjectsPageProps) {
  return (
    <>
      {createProjectOpen ? (
        <Card
          className="admin-card create-project-panel"
          extra={
            <Button
              onClick={() => {
                setCreateProjectOpen(false);
                createProjectForm.resetFields();
              }}
            >
              收起
            </Button>
          }
          title="新建项目"
        >
          <Form
            form={createProjectForm}
            initialValues={{
              priority: "P1",
              progress: 0,
              status: "规划中",
            }}
            layout="vertical"
          >
            <Form.Item
              label="项目名称"
              name="name"
              rules={[{ message: "请输入项目名称", required: true }]}
            >
              <Input placeholder="例如：生成链路真实化" />
            </Form.Item>
            <Form.Item
              label="负责人"
              name="owner"
              rules={[{ message: "请输入负责人", required: true }]}
            >
              <Input placeholder="例如：林舟" />
            </Form.Item>
            <Flex gap={12} wrap>
              <Form.Item
                className="project-form-item"
                label="状态"
                name="status"
              >
                <Select
                  options={["规划中", "进行中", "风险", "已上线"].map(
                    (value) => ({
                      label: value,
                      value,
                    }),
                  )}
                />
              </Form.Item>
              <Form.Item
                className="project-form-item"
                label="优先级"
                name="priority"
              >
                <Select
                  options={["P0", "P1", "P2"].map((value) => ({
                    label: value,
                    value,
                  }))}
                />
              </Form.Item>
              <Form.Item
                className="project-form-item"
                label="进度"
                name="progress"
              >
                <InputNumber max={100} min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Flex>
            <Flex gap={12} wrap>
              <Form.Item
                className="project-form-item"
                label="预算"
                name="budget"
              >
                <Input placeholder="例如：8w" />
              </Form.Item>
              <Form.Item
                className="project-form-item"
                label="截止日期"
                name="dueDate"
              >
                <Input placeholder="例如：07/01" />
              </Form.Item>
            </Flex>
            <Form.Item label="成员" name="team">
              <Input placeholder="用逗号分隔，例如：林舟，Mia，Kevin" />
            </Form.Item>
            <Form.Item label="项目 Key" name="key">
              <Input placeholder="可选，例如：real-runtime" />
            </Form.Item>
            <Flex gap={8} justify="end">
              <Button
                onClick={() => {
                  setCreateProjectOpen(false);
                  createProjectForm.resetFields();
                }}
              >
                取消
              </Button>
              <Button
                disabled={!capabilities.canCreateProject}
                loading={creatingProject}
                onClick={() => void onCreateProject()}
                type="primary"
              >
                创建项目
              </Button>
            </Flex>
          </Form>
        </Card>
      ) : null}

      <Card
        className="admin-card"
        extra={
          <div className="status-filter">
            <Segmented
              onChange={(value) =>
                setStatusFilter(value as ProjectStatus | "全部")
              }
              options={["全部", "进行中", "风险", "规划中", "已上线"]}
              value={statusFilter}
            />
          </div>
        }
        id="project-list"
        title="项目列表"
      >
        <div className="table-scroll">
          <Table
            columns={projectColumns}
            dataSource={filteredProjects}
            locale={{ emptyText: <Empty description="没有匹配的项目" /> }}
            loading={dashboardLoading}
            pagination={false}
            rowKey="key"
            size="middle"
          />
        </div>
      </Card>
    </>
  );
}
