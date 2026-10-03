import { cookies } from "next/headers";

// Demo-only mock: restricted to instructors via a mock cookie.
export default async function AnswerKeyPage() {
  const instructor = (await cookies()).get("mock_instructor")?.value === "1";
  const style = { maxWidth: 640, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" };
  if (!instructor) {
    return (
      <main style={style}>
        <h1>403 — Instructors only</h1>
        <p>You do not have permission to view the answer key.</p>
      </main>
    );
  }
  return (
    <main style={style}>
      <h1>Answer key</h1>
      <ol>
        <li>Forbidden</li>
        <li>No unauthorized access</li>
        <li>Not perform the action</li>
      </ol>
    </main>
  );
}
