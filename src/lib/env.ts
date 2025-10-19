import * as v from "valibot";
import { createEnv } from "valibot-env/nextjs";

export const env = createEnv({
  schema: {
    private: {
      ALLOW_EMAILS: v.string(),
      AUTH_GOOGLE_ID: v.string(),
      AUTH_GOOGLE_SECRET: v.string(),
      AUTH_SECRET: v.string(),
      B2_APP_KEY: v.string(),
      B2_KEY_ID: v.string(),
    },
    public: {},
    shared: {},
  },
  values: {
    ALLOW_EMAILS: process.env.ALLOW_EMAILS,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    B2_APP_KEY: process.env.B2_APP_KEY,
    B2_KEY_ID: process.env.B2_KEY_ID,
  },
});
