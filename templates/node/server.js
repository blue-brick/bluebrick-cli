import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import { requireAuth } from './src/middleware/auth.js';
import authRoutes from './src/routes/auth.js';
import pageRoutes from './src/routes/pages.js';

const { ADMIN_PASSWORD, SESSION_SECRET, PORT = 3000, NODE_ENV } = process.env;
const isProd = NODE_ENV === 'production';

if (!ADMIN_PASSWORD || !SESSION_SECRET) {
  console.error('Missing ADMIN_PASSWORD or SESSION_SECRET. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));

// CloudPanel / nginx sits in front in production
if (isProd) app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(import.meta.dirname, 'public')));

app.use(
  session({
    name: 'bb.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// Public: login only. Everything below is behind the admin password.
app.use(authRoutes);
app.use(requireAuth);
app.use(pageRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

// 500
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('500', { title: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`{{name}} running on http://localhost:${PORT}`);
});
