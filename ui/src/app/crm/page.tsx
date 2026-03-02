import { redirect } from "next/navigation";

// CRM feature under development — redirects to dashboard
export default function Page() {
  redirect("/dashboard");
}
