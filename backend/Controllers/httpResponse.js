export function sendError(res, status, code, message, details = undefined, legacyFields = {}) {
  const requestId = res.req?.requestId || res.getHeader("x-request-id") || null;
  const error = {
    code,
    message,
    requestId
  };

  if (details && Object.keys(details).length > 0) {
    error.details = details;
  }

  return res.status(status).json({
    ...legacyFields,
    message,
    requestId,
    error
  });
}
