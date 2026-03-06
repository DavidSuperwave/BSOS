import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { requireCompanyAccess } from "@/lib/api-auth";

function getStripeClient() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(stripeSecretKey);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!adminClient) adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

type CheckoutRequestBody = {
  company_id?: string;
  domain_inventory_id?: string;
  mailbox_count?: number;
};

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const body = (await request.json()) as CheckoutRequestBody;
    const companyId = body.company_id;
    const domainInventoryId = body.domain_inventory_id;
    const mailboxCount = Number.isFinite(body.mailbox_count)
      ? Math.max(1, Math.floor(body.mailbox_count as number))
      : 3;

    if (!companyId || !domainInventoryId) {
      return NextResponse.json(
        { error: "company_id and domain_inventory_id are required" },
        { status: 400 }
      );
    }

    const accessCheck = await requireCompanyAccess(companyId);
    if ("error" in accessCheck) return accessCheck.error;

    const { auth } = accessCheck;
    const admin = getAdmin();

    const { data: domain, error: domainError } = await admin
      .from("domain_inventory")
      .select("id, domain_name, domain_type, sale_price, status")
      .eq("id", domainInventoryId)
      .single();

    if (domainError || !domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (domain.status !== "available") {
      return NextResponse.json(
        { error: "Domain is not available" },
        { status: 409 }
      );
    }

    const reservedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: reserveError } = await admin
      .from("domain_inventory")
      .update({
        status: "reserved",
        reserved_until: reservedUntil,
        assigned_to_company_id: companyId,
      })
      .eq("id", domainInventoryId)
      .eq("status", "available");

    if (reserveError) {
      return NextResponse.json(
        { error: "Failed to reserve domain" },
        { status: 500 }
      );
    }

    const { data: reservedDomain, error: reservedDomainError } = await admin
      .from("domain_inventory")
      .select("id, status")
      .eq("id", domainInventoryId)
      .single();

    if (reservedDomainError || !reservedDomain || reservedDomain.status !== "reserved") {
      return NextResponse.json(
        { error: "Could not confirm domain reservation" },
        { status: 409 }
      );
    }

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { data: billingRow } = await admin
      .from("company_billing")
      .select("stripe_customer_id, billing_email, billing_name")
      .eq("company_id", companyId)
      .maybeSingle();

    let stripeCustomerId = billingRow?.stripe_customer_id ?? null;
    const billingEmail = billingRow?.billing_email ?? auth.email ?? null;
    const billingName = billingRow?.billing_name ?? company.name ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: billingEmail ?? undefined,
        name: billingName ?? undefined,
        metadata: {
          company_id: companyId,
        },
      });
      stripeCustomerId = customer.id;

      const { error: billingUpsertError } = await admin.from("company_billing").upsert(
        {
          company_id: companyId,
          stripe_customer_id: stripeCustomerId,
          billing_email: billingEmail,
          billing_name: billingName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

      if (billingUpsertError) {
        return NextResponse.json(
          { error: "Failed to save billing profile" },
          { status: 500 }
        );
      }
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    const mailboxUnitAmount = 1000;
    lineItems.push({
      price_data: {
        currency: "usd",
        recurring: { interval: "month" },
        product_data: {
          name: `Mailbox Subscription - ${domain.domain_name}`,
          description: "$10 per mailbox / month",
        },
        unit_amount: mailboxUnitAmount,
      },
      quantity: mailboxCount,
    });

    if (domain.domain_type !== "byo") {
      const unitAmount = Math.round(Number(domain.sale_price ?? 0) * 100);
      if (unitAmount > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: `${domain.domain_type === "elite" ? "Elite" : "Standard"} Domain - ${domain.domain_name}`,
              description: "One-time domain assignment fee",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        });
      }
    }

    const { data: pendingTx, error: txError } = await admin
      .from("domain_transactions")
      .insert({
        company_id: companyId,
        domain_inventory_id: domainInventoryId,
        amount_paid: 0,
        currency: "usd",
        type: "purchase",
        status: "pending",
        metadata: {
          mailbox_count: mailboxCount,
          domain_name: domain.domain_name,
          domain_type: domain.domain_type,
        },
      })
      .select("id")
      .single();

    if (txError || !pendingTx) {
      return NextResponse.json(
        { error: "Failed to create pending transaction" },
        { status: 500 }
      );
    }

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: lineItems,
      success_url: `${origin}/inboxes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/inboxes?canceled=true`,
      metadata: {
        company_id: companyId,
        domain_inventory_id: domainInventoryId,
        domain_transaction_id: pendingTx.id,
      },
      subscription_data: {
        metadata: {
          company_id: companyId,
          domain_inventory_id: domainInventoryId,
        },
      },
      client_reference_id: companyId,
      allow_promotion_codes: true,
    });

    await admin
      .from("domain_transactions")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", pendingTx.id);

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error("[stripe.checkout] Error creating checkout session", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
