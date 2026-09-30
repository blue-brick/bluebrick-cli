import crypto from 'node:crypto';
import { Router } from 'express';

const router = Router();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map(); // ip -> { count, resetAt }

function isBlocked(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function passwordMatches(input) {
  const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(hash(input), hash(process.env.ADMIN_PASSWORD));
}

router.get('/login', (req, res) => {
  if (req.session?.isAdmin) return res.redirect('/');
  res.render('login', { title: 'Login', error: null });
});

router.post('/login', (req, res, next) => {
  const ip = req.ip;

  if (isBlocked(ip)) {
    return res.status(429).render('login', {
      title: 'Login',
      error: 'Too many attempts. Try again in a few minutes.',
    });
  }

  if (!passwordMatches(req.body.password ?? '')) {
    recordFailure(ip);
    return res.status(401).render('login', { title: 'Login', error: 'Wrong password.' });
  }

  attempts.delete(ip);
  // new session id after login
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.isAdmin = true;
    req.session.save((err2) => {
      if (err2) return next(err2);
      res.redirect('/');
    });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bb.sid');
    res.redirect('/login');
  });
});

export default router;
