import Stripe from 'stripe';
import { supabase } from '../db/supabase';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(500, 'Stripe is not configured');
  }
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });
}

export async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const stripe = getStripe();
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .not('stripe_customer_id', 'is', null)
    .limit(1)
    .single();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;
  const customer = await stripe.customers.create({ email, metadata: { user_id: userId } });
  return customer.id;
}

export async function createCheckoutSession(
  userId: string, email: string, role: 'coach' | 'athlete',
  planType: 'coach_team' | 'athlete_individual'
): Promise<string> {
  const stripe = getStripe();
  const priceId = planType === 'coach_team' ? env.STRIPE_COACH_PRICE_ID : env.STRIPE_ATHLETE_PRICE_ID;
  if (!priceId) throw new AppError(500, 'Stripe price ID is not configured for this plan');
  const customerId = await getOrCreateCustomer(userId, email);
  const session = await stripe.checkout.sessions.create({
    customer: customerId, mode: 'subscription', payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/billing?status=success`,
    cancel_url: `${env.FRONTEND_URL}/pricing?status=cancelled`,
    metadata: { user_id: userId, role, plan_type: planType }
  });
  if (!session.url) throw new AppError(500, 'Failed to create checkout session');
  return session.url;
}

export async function createPortalSession(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId, return_url: `${env.FRONTEND_URL}/billing`
  });
  return session.url;
}

export async function getSubscriptionStatus(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).single();
  if (error || !data) {
    return { subscribed: false, status: 'inactive' as const, plan_type: null,
      current_period_end: null, cancel_at_period_end: false, stripe_customer_id: null };
  }
  return { subscribed: data.status === 'active' || data.status === 'trialing',
    status: data.status, plan_type: data.plan_type, current_period_end: data.current_period_end,
    cancel_at_period_end: data.cancel_at_period_end, stripe_customer_id: data.stripe_customer_id };
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const role = session.metadata?.role as 'coach' | 'athlete';
      const planType = session.metadata?.plan_type as 'coach_team' | 'athlete_individual';
      if (!userId || !role || !planType) { console.error('[Billing] Missing metadata'); return; } // eslint-disable-line no-console
      const stripe = getStripe();
      const subscriptionId = session.subscription as string;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await supabase.from('subscriptions').upsert({
        user_id: userId, role, stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: subscription.items.data[0]?.price.id || null,
        plan_type: planType, status: 'active',
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString()
      }, { onConflict: 'stripe_subscription_id' });
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const statusMap: Record<string, string> = {
        active: 'active', past_due: 'past_due', canceled: 'cancelled', trialing: 'trialing',
        incomplete: 'inactive', incomplete_expired: 'inactive', unpaid: 'past_due', paused: 'inactive'
      };
      await supabase.from('subscriptions').update({
        status: statusMap[sub.status] || 'inactive',
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        stripe_price_id: sub.items.data[0]?.price.id || null,
        updated_at: new Date().toISOString()
      }).eq('stripe_subscription_id', sub.id);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await supabase.from('subscriptions').update({
        status: 'cancelled', cancel_at_period_end: false, updated_at: new Date().toISOString()
      }).eq('stripe_subscription_id', sub.id);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string;
      if (subId) {
        await supabase.from('subscriptions').update({
          status: 'past_due', updated_at: new Date().toISOString()
        }).eq('stripe_subscription_id', subId);
      }
      break;
    }
    default: break;
  }
}
