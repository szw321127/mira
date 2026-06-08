import { Controller, Get } from '@nestjs/common';
import { AdminProjectsService } from './admin-projects.service';

@Controller('admin/projects')
export class AdminProjectsController {
  constructor(private readonly adminProjectsService: AdminProjectsService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminProjectsService.getDashboard();
  }
}
