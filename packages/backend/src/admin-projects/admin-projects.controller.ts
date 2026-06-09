import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { AdminProjectsService } from './admin-projects.service';
import { CreateAdminProjectDto } from './dto/create-admin-project.dto';
import { CreateAdminTaskDto } from './dto/create-admin-task.dto';
import { UpdateAdminTaskDto } from './dto/update-admin-task.dto';

@Controller('admin/projects')
@UseGuards(AdminJwtAuthGuard)
export class AdminProjectsController {
  constructor(private readonly adminProjectsService: AdminProjectsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminProjectsService.getDashboard();
  }

  @Post()
  createProject(@Body() dto: CreateAdminProjectDto) {
    return this.adminProjectsService.createProject(dto);
  }

  @Post('tasks')
  createTask(@Body() dto: CreateAdminTaskDto) {
    return this.adminProjectsService.createTask(dto);
  }

  @Patch('tasks/:key')
  updateTask(@Param('key') key: string, @Body() dto: UpdateAdminTaskDto) {
    return this.adminProjectsService.updateTask(key, dto);
  }

  @Delete('tasks/:key')
  deleteTask(@Param('key') key: string) {
    return this.adminProjectsService.deleteTask(key);
  }
}
