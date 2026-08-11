import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();