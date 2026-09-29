// Unexpected failures: full details go to the server log, never to the client.
const serverError = (res, error, context = 'server error') => {
  console.error(`${context}:`, error);
  if (res.headersSent) return;
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
};

module.exports = { serverError };
