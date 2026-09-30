import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import { requireAuth } from './src/middleware/auth.js';
import authRoutes from './src/routes/auth.js';
import pageRoutes from './src/routes/pages.js';

const { ADMIN_PASSWORD, SESSION_SECRET, PORT = 3000, NODE_ENV } = process.env;
const isProd = NODE_ENV === 'production';

// Refuse to start with missing or placeholder secrets
const PLACEHOLDERS = ['change-me', 'change-me-too'];
const configErrors = [];

if (!ADMIN_PASSWORD || PLACEHOLDERS.includes(ADMIN_PASSWORD) || ADMIN_PASSWORD.length < 8) {
  configErrors.push('ADMIN_PASSWORD must be set to a real password (8+ characters), not the placeholder.');
}
if (!SESSION_SECRET || PLACEHOLDERS.includes(SESSION_SECRET) || SESSION_SECRET.length < 32) {
  configErrors.push(
    `SESSION_SECRET must be a random string of 32+ characters. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  );
}
if (configErrors.length > 0) {
  console.error(`\nCannot start, fix your .env:\n- ${configErrors.join('\n- ')}\n`);
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
