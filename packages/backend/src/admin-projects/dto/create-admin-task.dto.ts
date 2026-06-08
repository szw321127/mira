import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { AdminTask } from '../admin-projects.types';

const taskStatuses: AdminTask['status'][] = [
  '待开始',
  '推进中',
  '验收中',
  '已完成',
];

export class CreateAdminTaskDto {
  @IsString()
  @MinLength(1)
  assignee!: string;

  @IsString()
  @MinLength(1)
  dueDate!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  projectKey?: string;

  @IsIn(taskStatuses)
  @IsOptional()
  status?: AdminTask['status'];
}
