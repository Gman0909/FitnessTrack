import app      from './app.js';
import { seed } from './seed.js';

const PORT = process.env.PORT ?? 3001;

seed();
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
