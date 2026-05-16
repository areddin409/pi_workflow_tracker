import express from 'express';
import cors from 'cors';

export function buildApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  return app;
}

if (require.main === module) {
  buildApp().listen(3001, () => console.log('Server running on :3001'));
}
