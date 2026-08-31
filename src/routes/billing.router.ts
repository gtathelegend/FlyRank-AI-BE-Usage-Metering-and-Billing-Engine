import { Router, Request, Response } from 'express';
export const billingRouter = Router();

/**
 * GET /billing/success
 * Success redirect page after completing Stripe Checkout session.
 */
billingRouter.get('/success', (req: Request, res: Response) => {
  const sessionId = req.query.session_id as string | undefined;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout Successful - FlyRank Billing Engine</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background-color: #1e293b;
      padding: 2.5rem;
      border-radius: 1rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: 480px;
      width: 90%;
      text-align: center;
      border: 1px solid #334155;
    }
    .icon {
      font-size: 3rem;
      color: #22c55e;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }
    p {
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .session-badge {
      background-color: #0f172a;
      color: #38bdf8;
      font-family: monospace;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      word-break: break-all;
      display: inline-block;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Checkout Successful!</h1>
    <p>Your subscription upgrade to the <strong>Pro Plan</strong> has been successfully processed.</p>
    ${sessionId ? `<div class="session-badge">Session: ${sessionId}</div>` : ''}
  </div>
</body>
</html>
`;

  return res.status(200).type('html').send(htmlContent);
});

/**
 * GET /billing/cancel
 * Cancel redirect page when user cancels Stripe Checkout session.
 */
billingRouter.get('/cancel', (req: Request, res: Response) => {
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checkout Cancelled - FlyRank Billing Engine</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background-color: #1e293b;
      padding: 2.5rem;
      border-radius: 1rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: 480px;
      width: 90%;
      text-align: center;
      border: 1px solid #334155;
    }
    .icon {
      font-size: 3rem;
      color: #f59e0b;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      color: #ffffff;
    }
    p {
      color: #94a3b8;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">!</div>
    <h1>Checkout Cancelled</h1>
    <p>Your subscription checkout session was cancelled. No charges were made to your account.</p>
  </div>
</body>
</html>
`;

  return res.status(200).type('html').send(htmlContent);
});
