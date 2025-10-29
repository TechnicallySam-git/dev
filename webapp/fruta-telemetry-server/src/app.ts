import express from 'express';
import { json } from 'body-parser';
import apiRoutes from './routes/api';
import errorHandler from './middleware/errorHandler';

const app = express();

// Middleware
app.use(json());
app.use(express.static('public'));

// Routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use(errorHandler);

export default app;