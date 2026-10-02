import { Router } from 'express';
import { checkPassword, getAuth, setPassword } from '../auth/store.js';
import { csrfToken, verifyCsrf } from '../middleware/csrf.js';
import { clearFailures, isBlocked, recordFailure } from '../security/rateLimit.js';

const router = Router();

function renderSettings(req, res, { error = null, status = 200 } = {}) {
  res.status(status).render('settings', {
    title: 'Settings',
    error,
    changed: req.query.changed === '1',
    changedAt: getAuth().changedAt || '',
    csrf: csrfToken(req),
  });
}

router.get('/settings', (req, res) => renderSettings(req, res));

router.post('/settings/password', verifyCsrf, (req, res, next) => {
  const ip = req.ip;

  if (isBlocked(ip)) {
    return renderSettings(req, res, {
      error: 'Too many attempts. Try again in a few minutes.',
      status: 429,
    });
  }

  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  const confirmPassword = String(req.body?.confirmPassword ?? '');

  if (!checkPassword(currentPassword)) {
    recordFailure(ip);
    return renderSettings(req, res, { error: 'Current password is wrong.', status: 401 });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return renderSettings(req, res, { error: 'New password must be 8 to 128 characters.', status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return renderSettings(req, res, { error: 'The two new passwords do not match.', status: 400 });
  }
  if (newPassword === currentPassword) {
    return renderSettings(req, res, { error: 'New password must be different from the current one.', status: 400 });
  }

  clearFailures(ip);
  const { version } = setPassword(newPassword);

  // Every other session is now invalid; keep this one signed in.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.isAdmin = true;
    req.session.authVersion = version;
    req.session.save((err2) => {
      if (err2) return next(err2);
      res.redirect('/settings?changed=1');
    });
  });
});

export default router;
