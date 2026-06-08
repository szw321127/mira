import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { AdminTask } from '../admin-projects.types';

const taskStatuses: AdminTask['status'][] = [
  '待开始',
  '推进中',
  '验收中',
  '已完成',
];

export class UpdateAdminTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  assignee?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  projectKey?: string;

  @IsIn(taskStatuses)
  @IsOptional()
  status?: AdminTask['status'];
}
