import { AdminProjectsService } from './admin-projects.service';

describe('AdminProjectsService', () => {
  it('returns dashboard data with projects, tasks, risk queue, notifications, and capabilities', () => {
    const service = new AdminProjectsService();

    const dashboard = service.getDashboard();

    expect(dashboard.projects).toHaveLength(4);
    expect(dashboard.tasks).toHaveLength(4);
    expect(dashboard.riskQueue).toEqual([
      expect.objectContaining({
        key: 'asset-pipeline',
        riskEscalationOwner: '林舟',
        riskNextAction: '今晚前补齐失败重试与告警阈值',
        riskSeverity: '高',
      }),
    ]);
    expect(dashboard.notifications).toEqual([]);
    expect(dashboard.capabilities).toEqual({
      canCreateProject: false,
    });
  });
});
