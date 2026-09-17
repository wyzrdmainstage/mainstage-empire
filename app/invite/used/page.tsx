export default function UsedInvitationPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg border border-[#f5b942]/30 bg-zinc-950 p-8 text-center">
        <h1 className="text-3xl font-bold text-[#f5b942]">
          Invitation Already Used
        </h1>

        <p className="mt-4 text-zinc-300">
          This invitation link has already been used.
          Please use the Mainstage Score login page instead.
        </p>

        <a
          href="/"
          className="mt-8 inline-block bg-[#f5b942] px-6 py-3 font-semibold text-black hover:bg-[#d9a334]"
        >
          Go to Login
        </a>
      </div>
    </main>
  );
}