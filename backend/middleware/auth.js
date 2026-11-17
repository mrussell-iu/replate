
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      error: "Please log in to continue."
    });
  }

  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({
        error: "Please log in to continue."
      });
    }

    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).json({
        error: "You are not authorized to perform this action."
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
