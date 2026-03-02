import { redirect } from "next/navigation";

// ICP Insights under development — redirects to dashboard
export default function Page() {
  redirect("/dashboard");
}
