export default function ExpiredInvitationPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg border border-[#f5b942]/30 bg-zinc-950 p-8 text-center">
        <h1 className="text-3xl font-bold text-[#f5b942]">
          Invitation Expired
        </h1>

        <p className="mt-4 text-zinc-300">
          This judge invitation has expired.
          Please contact the competition organizer for a new invitation.
        </p>

        <a
          href="/"
          className="mt-8 inline-block bg-[#f5b942] px-6 py-3 font-semibold text-black hover:bg-[#d9a334]"
        >
          Return to Mainstage Score
        </a>
      </div>
    </main>
  );
}