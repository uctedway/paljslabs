function getManageAdminSession(req) {
  return req && req.session ? req.session.manageAdmin : null;
}

function requireManageAuth(req, res, next) {
  const admin = getManageAdminSession(req);
  if (admin && admin.admin_id) return next();
  const nextPath = encodeURIComponent(req.originalUrl || '/manage');
  return res.redirect(`/manage/login?next=${nextPath}`);
}

function requireManageGuest(req, res, next) {
  const admin = getManageAdminSession(req);
  if (admin && admin.admin_id) return res.redirect('/manage');
  return next();
}

module.exports = {
  requireManageAuth,
  requireManageGuest,
};
