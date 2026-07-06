import express from 'express';
import cors from 'cors';
import { bindExpress } from './src/api/index.js';

const app = express();
app.use(cors());
app.use(express.json());
bindExpress(app);

const PORT = 3000;
app.listen(PORT, () => console.log(`Arcet platform API running on http://localhost:${PORT}`));
