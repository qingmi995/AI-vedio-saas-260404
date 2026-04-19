"use server";

import { z } from "zod";

import { userActionClient } from "@/lib/safe-action";
import {
  createStripeProductCheckout,
  createStripeSession,
  getMySubscription,
  getUserPlans,
} from "@/services/billing";

export const createStripeSessionAction = userActionClient
  .schema(z.object({ planId: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await createStripeSession(ctx.user.id, parsedInput.planId);
    return { success: result.success, url: result.url };
  });

export const createStripeProductCheckoutAction = userActionClient
  .schema(
    z.object({
      productId: z.string().min(1),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await createStripeProductCheckout({
      userId: ctx.user.id,
      productId: parsedInput.productId,
      successUrl: parsedInput.successUrl,
      cancelUrl: parsedInput.cancelUrl,
    });
    return { success: result.success, url: result.url };
  });

export const getUserPlansAction = userActionClient
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    const plan = await getUserPlans(ctx.user.id);
    return { success: true, plan };
  });

export const getMySubscriptionAction = userActionClient
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    const subscription = await getMySubscription(ctx.user.id);
    return { success: true, subscription };
  });
