import { runSeeders } from 'typeorm-extension';
import AppDataSource from './data-source';
import { MainSeeder } from '../seed/main.seeder';

async function run() {
  const dataSource = await AppDataSource.initialize();

  try {
    await runSeeders(dataSource, {
      seeds: [MainSeeder],
    });
    console.log('Database seeding completed successfully.');
  } finally {
    await dataSource.destroy();
  }
}

void run();
