import { requireUser } from "@/src/auth/require-user";
import AccountForm from "./AccountForm";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <AccountForm
      user={{
        name: user.name,
        email: user.email,
        roles: user.roles,
      }}
    />
  );
}
