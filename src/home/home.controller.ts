import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { HomeService } from './home.service';

@ApiTags('Home')
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get composite homepage payload' })
  @ApiQuery({ name: 'limitPerSection', required: false, example: 8 })
  @ApiQuery({ name: 'location', required: false, example: 'lagos' })
  async getHomepage(
    @Query('limitPerSection') limitPerSection: number = 8,
    @Query('location') location?: string,
  ) {
    return this.homeService.getHomepage(Math.min(+limitPerSection || 8, 20), location);
  }
}
