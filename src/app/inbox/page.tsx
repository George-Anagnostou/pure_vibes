import { redirect } from "next/navigation";

// The dashboard is the signed-in home; old inbox links land there.
export default function InboxPage() {
  redirect("/dashboard");
}
