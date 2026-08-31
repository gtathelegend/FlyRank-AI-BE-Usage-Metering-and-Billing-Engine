import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '8000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://billing_user:billing_password@localhost:5432/flyrank_billing_db',
  STRIPE: {
    SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
    WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
    PRICE_PRO: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
  },
  PRICING: {
    // Micro-cents per 1,000 tokens (1 USD = 1,000,000 micro-cents = 100 cents = 10,000 micro-cents per cent)
    // $1.25 per 1M tokens -> 1,250,000 microcents / 1,000,000 = 1.25 microcents per token = 125 microcents per 100 tokens
    UNCACHED_INPUT_MICRO_CENTS_PER_100: 125n, // $1.25 / 1M
    CACHED_INPUT_MICRO_CENTS_PER_100: 30n,     // $0.30 / 1M
    OUTPUT_MICRO_CENTS_PER_100: 500n,          // $5.00 / 1M (Reasoning tokens priced identically)
    API_CALL_BASE_MICRO_CENTS: 100n,           // $0.001 per API call
    MICRO_CENTS_PER_CENT: 10000n,
  },
};
