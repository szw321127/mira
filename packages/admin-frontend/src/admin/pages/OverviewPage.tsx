import { Button, Card, Empty, Flex, Statistic, Tag, Typography } from "antd";
import type { AdminDashboard, AdminProject as Project } from "../../api";

const { Text } = Typography;

type OverviewPageProps = {
  metrics: AdminDashboard["metrics"];
  onSelectProject: (project: Project) => void;
  riskQueueProjects: Project[];
};

export function OverviewPage({
  metrics,
  onSelectProject,
  riskQueueProjects,
}: OverviewPageProps) {
  return (
    <>
      <div className="metric-grid">
        <Card>
          <Statistic
            title="进行中项目"
            value={metrics.activeProjects}
            suffix={`/ ${metrics.totalProjects}`}
          />
        </Card>
        <Card>
          <Statistic
            title="本周完成任务"
            value={metrics.weeklyCompletedTasks}
          />
        </Card>
        <Card>
          <Statistic
            styles={{ content: { color: "#b20d2a" } }}
            title="风险项目"
            value={metrics.riskProjects}
          />
        </Card>
        <Card>
          <Statistic
            title="平均进度"
            value={metrics.averageProgress}
            suffix="%"
          />
        </Card>
      </div>

      <Card
        className="admin-card risk-queue"
        title={
          <Flex align="center" gap={8} wrap>
            <span>风险处理队列</span>
            <Tag color="error">{riskQueueProjects.length} 项待处理</Tag>
          </Flex>
        }
      >
        {riskQueueProjects.length > 0 ? (
          <div className="risk-list">
            {riskQueueProjects.map((project) => (
              <div className="risk-item" key={project.key}>
                <div className="risk-item-main">
                  <Flex align="center" gap={8} wrap>
                    <Tag color="error">严重度：{project.riskSeverity}</Tag>
                    <Button
                      className="project-link"
                      onClick={() => onSelectProject(project)}
                      type="link"
                    >
                      {project.name}
                    </Button>
                  </Flex>
                  <Text>{project.riskReason}</Text>
                </div>
                <div className="risk-meta-grid">
                  <div>
                    <Text type="secondary">最近更新</Text>
                    <strong>{project.riskLatestUpdate}</strong>
                  </div>
                  <div>
                    <Text type="secondary">下一步动作</Text>
                    <strong>{project.riskNextAction}</strong>
                  </div>
                  <div>
                    <Text type="secondary">升级负责人</Text>
                    <strong>{project.riskEscalationOwner}</strong>
                  </div>
                </div>
                <Button
                  onClick={() => onSelectProject(project)}
                  size="small"
                  type="primary"
                >
                  查看详情
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="当前没有匹配的风险项目" />
        )}
      </Card>
    </>
  );
}
