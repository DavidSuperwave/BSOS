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

type CustomerBody = {
  company_id?: string;
  billing_email?: string;
  billing_name?: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id query parameter is required" },
        { status: 400 }
      );
    }

    const accessCheck = await requireCompanyAccess(companyId);
    if ("error" in accessCheck) return accessCheck.error;

    const admin = getAdmin();

    const { data: billing, error } = await admin
      .from("company_billing")
      .select(
        "stripe_customer_id, billing_email, payment_method_id, auto_renew_domains"
      )
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch customer billing profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      customer: {
        stripe_customer_id: billing?.stripe_customer_id ?? null,
        billing_email: billing?.billing_email ?? null,
        payment_method_id: billing?.payment_method_id ?? null,
        auto_renew_domains: billing?.auto_renew_domains ?? false,
      },
    });
  } catch (error) {
    console.error("[stripe.customer.GET] Error", error);
    return NextResponse.json(
      { error: "Failed to get customer" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const body = (await request.json()) as CustomerBody;
    const companyId = body.company_id;

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    const accessCheck = await requireCompanyAccess(companyId);
    if ("error" in accessCheck) return accessCheck.error;

    const { auth } = accessCheck;
    const admin = getAdmin();

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { data: billingExisting, error: billingError } = await admin
      .from("company_billing")
      .select("stripe_customer_id, billing_email, billing_name")
      .eq("company_id", companyId)
      .maybeSingle();

    if (billingError) {
      return NextResponse.json(
        { error: "Failed to read existing billing data" },
        { status: 500 }
      );
    }

    const billingEmail =
      body.billing_email ?? billingExisting?.billing_email ?? auth.user.email ?? null;
    const billingName =
      body.billing_name ?? billingExisting?.billing_name ?? company.name ?? null;

    let stripeCustomerId = billingExisting?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: billingEmail ?? undefined,
        name: billingName ?? undefined,
        metadata: { company_id: companyId },
      });
      stripeCustomerId = customer.id;
    } else {
      await stripe.customers.update(stripeCustomerId, {
        email: billingEmail ?? undefined,
        name: billingName ?? undefined,
        metadata: { company_id: companyId },
      });
    }

    const { error: upsertError } = await admin.from("company_billing").upsert(
      {
        company_id: companyId,
        stripe_customer_id: stripeCustomerId,
        billing_email: billingEmail,
        billing_name: billingName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to save billing profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ customer_id: stripeCustomerId });
  } catch (error) {
    console.error("[stripe.customer.POST] Error", error);
    return NextResponse.json(
      { error: "Failed to create or update customer" },
      { status: 500 }
    );
  }
}
