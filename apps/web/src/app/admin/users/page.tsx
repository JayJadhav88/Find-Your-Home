import { redirect } from "next/navigation";

// The user list is split into Team & roles and Customers.
export default function AdminUsersPage() {
  redirect("/admin/customers");
}
