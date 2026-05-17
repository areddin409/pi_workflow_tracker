import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { openDatabase } from './db/database';
import { casesRouter } from './routes/cases';
import { tasksRouter } from './routes/tasks';
import { templatesRouter } from './routes/templates';
import { contactsRouter } from './routes/contacts';
import { contactScheduleRouter } from './routes/contact-schedule';
import { contactActionItemsRouter } from './routes/contact-action-items';
import { dashboardRouter } from './routes/dashboard';
import { settingsRouter } from './routes/settings';
import { communicationRouter } from './routes/communication';

export function buildApp(db: Database.Database) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/cases', casesRouter(db));
  app.use('/api/tasks', tasksRouter(db));
  app.use('/api/templates', templatesRouter(db));
  app.use('/api/contacts', contactsRouter(db));
  app.use('/api/contact-schedule', contactScheduleRouter(db));
  app.use('/api/contact-action-items', contactActionItemsRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api/settings', settingsRouter(db));
  app.use('/api/communication', communicationRouter(db));
  return app;
}

if (require.main === module) {
  const db = openDatabase();
  buildApp(db).listen(3001, () => console.log('Server running on :3001'));
}
