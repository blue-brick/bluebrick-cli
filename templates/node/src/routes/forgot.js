import { Router } from 'express';
import { consumeResetCode, hasActiveCode, requestResetCode } from '../auth/resetCode.js';
import { setPassword } from '../auth/store.js';
import { clearFailures, isBlocked, recordFailure } from '../security/rateLimit.js';

const router = Router();

function renderForgot(res, { error = null, info = null, status = 200 } = {}) {
  res.status(status).render('forgot', {
    title: 'Forgot password',
    error,
    info,
    active: hasActiveCode(),
  });
}

router.get('/forgot', (req, res) => renderForgot(res));

router.post('/forgot/request', (req, res) => {
  const result = requestResetCode();
  if (!result.ok) return renderForgot(res, { error: result.error, status: 429 });

  renderForgot(res, {
    info: 'Reset code created. Find it in the server log, or run: cat data/reset.json (in the project folder). It is valid for 15 minutes.',
  });
});

router.post('/forgot/reset', (req, res) => {
  const ip = req.ip;

  if (isBlocked(ip)) {
    return renderForgot(res, { error: 'Too many attempts. Try again in a few minutes.', status: 429 });
  }

  const code = String(req.body?.code ?? '');
  const newPassword = String(req.body?.newPassword ?? '');
  const confirmPassword = String(req.body?.confirmPassword ?? '');

  // Check the password first, so a typo doesn't burn the one-time code.
  if (newPassword.length < 8 || newPassword.length > 128) {
    return renderForgot(res, { error: 'New password must be 8 to 128 characters.', status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return renderForgot(res, { error: 'The two passwords do not match.', status: 400 });
  }

  const result = consumeResetCode(code);
  if (!result.ok) {
    recordFailure(ip);
    return renderForgot(res, { error: result.error, status: 400 });
  }

  clearFailures(ip);
  setPassword(newPassword); // bumps the version: every session is signed out
  res.redirect('/login?reset=1');
});

export default router;
