import express from 'express';
import { json } from 'body-parser';
import { errorHandler } from './middleware/errorHandler';
import { setupRoutes } from './routes/api';
import { config } from './config';
import { createApp } from './app'; // Adjust the import based on your project structure

const app = createApp(); // or however your app is created
// attach SSE endpoint that polls the blob container
require('./server-sse')(app);

const PORT = process.env.PORT || 3000;

app.use(json());
setupRoutes(app);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});