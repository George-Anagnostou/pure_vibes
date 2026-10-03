import { redirect } from "next/navigation";

// The inbox replaced the dashboard.
export default function DashboardPage() {
  redirect("/inbox");
}
