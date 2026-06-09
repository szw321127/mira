import {
  CheckCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ProjectOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";

export type NavigationKey =
  | "overview"
  | "projects"
  | "tasks"
  | "members"
  | "settings"
  | "contentProviders"
  | "adminProfile";

export const menuItems: MenuProps["items"] = [
  { icon: <DashboardOutlined />, key: "overview", label: "项目总览" },
  { icon: <ProjectOutlined />, key: "projects", label: "项目列表" },
  { icon: <CheckCircleOutlined />, key: "tasks", label: "任务看板" },
  { icon: <TeamOutlined />, key: "members", label: "成员管理" },
  { icon: <SettingOutlined />, key: "settings", label: "模型配置" },
  { icon: <DatabaseOutlined />, key: "contentProviders", label: "内容来源" },
  { icon: <UserOutlined />, key: "adminProfile", label: "管理员信息" },
];

export const activeMenuTitles: Record<NavigationKey, string> = {
  adminProfile: "管理员信息",
  contentProviders: "内容来源",
  members: "成员管理",
  overview: "项目总览",
  projects: "项目列表",
  settings: "模型配置",
  tasks: "任务看板",
};
