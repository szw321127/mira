import { Body, Controller, Get, Post } from '@nestjs/common';
import { AdminProjectsService } from './admin-projects.service';
import { CreateAdminProjectDto } from './dto/create-admin-project.dto';

@Controller('admin/projects')
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
}
