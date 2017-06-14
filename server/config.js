import dotenv from 'dotenv';

dotenv.config({ silent: true });

export const { JWT_SECRET, FIREBASE_SERVER_KEY } = process.env;
