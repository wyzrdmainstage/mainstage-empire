"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginProcessor() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No login token was provided.");
      return;
    }

    // Prevent the same one-time token from being submitted
    // more than once during the client lifecycle.
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    async function authenticate() {
      try {
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Unable to sign you in.");
          return;
        }

        router.replace("/dashboard");
      } catch {
        setError("Unable to connect to the server.");
      }
    }

    authenticate();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-900 bg-red-950/40 p-6 text-center">
        <h1 className="text-xl font-semibold text-red-400">
          Login Failed
        </h1>

        <p className="mt-2 text-sm text-red-300">
          {error}
        </p>

        <button
          onClick={() => router.replace("/")}
          className="mt-6 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-amber-400" />

      <h1 className="mt-6 text-xl font-semibold">
        Signing you in...
      </h1>

      <p className="mt-2 text-sm text-zinc-400">
        Please wait while we verify your login.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <Suspense
        fallback={
          <div className="text-center">
            <p className="text-zinc-400">Loading...</p>
          </div>
        }
      >
        <LoginProcessor />
      </Suspense>
    </main>
  );
}