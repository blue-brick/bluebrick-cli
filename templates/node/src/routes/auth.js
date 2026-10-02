import { Router } from 'express';
import { checkPassword, getAuth } from '../auth/store.js';
import { isAuthed } from '../middleware/auth.js';
import { clearFailures, isBlocked, recordFailure } from '../security/rateLimit.js';

const router = Router();

router.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/');
  res.render('login', {
    title: 'Login',
    error: null,
    notice: req.query.reset === '1' ? 'Password changed. Log in with the new one.' : null,
  });
});

router.post('/login', (req, res, next) => {
  const ip = req.ip;

  if (isBlocked(ip)) {
    return res.status(429).render('login', {
      title: 'Login',
      error: 'Too many attempts. Try again in a few minutes.',
    });
  }

  if (!checkPassword(String(req.body?.password ?? ''))) {
    recordFailure(ip);
    return res.status(401).render('login', { title: 'Login', error: 'Wrong password.' });
  }

  clearFailures(ip);
  const { version } = getAuth();

  // new session id after login
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.isAdmin = true;
    req.session.authVersion = version;
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
