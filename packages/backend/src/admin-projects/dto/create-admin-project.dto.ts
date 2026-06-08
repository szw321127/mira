import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { AdminProjectStatus } from '../admin-projects.types';

const projectStatuses: AdminProjectStatus[] = [
  '进行中',
  '规划中',
  '风险',
  '已上线',
];

const projectPriorities = ['P0', 'P1', 'P2'] as const;
const riskSeverities = ['高', '中', '低'] as const;

export class CreateAdminProjectDto {
  @IsOptional()
  @IsString()
  budget?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  owner!: string;

  @IsOptional()
  @IsIn(projectPriorities)
  priority?: (typeof projectPriorities)[number];

  @IsInt()
  @IsOptional()
  @Max(100)
  @Min(0)
  progress?: number;

  @IsOptional()
  @IsString()
  riskEscalationOwner?: string;

  @IsOptional()
  @IsString()
  riskLatestUpdate?: string;

  @IsOptional()
  @IsString()
  riskNextAction?: string;

  @IsOptional()
  @IsString()
  riskReason?: string;

  @IsIn(riskSeverities)
  @IsOptional()
  riskSeverity?: (typeof riskSeverities)[number];

  @IsIn(projectStatuses)
  @IsOptional()
  status?: AdminProjectStatus;

  @ArrayMaxSize(12)
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  team?: string[];
}
