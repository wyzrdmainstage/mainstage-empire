import { NextResponse } from "next/server";
import { requireRole } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";

export async function POST(request: Request) {
  try {
    const user = await requireRole(["ADMIN", "ORGANIZER"]);

    const body = await request.json();

    const name =
      typeof body.name === "string" ? body.name.trim() : "";

    const venueName =
      typeof body.venueName === "string"
        ? body.venueName.trim()
        : "";

    const date =
      typeof body.date === "string" ? body.date.trim() : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        { message: "Competition name is required." },
        { status: 400 }
      );
    }

    if (!venueName) {
      return NextResponse.json(
        { message: "Venue name is required." },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { message: "Competition date is required." },
        { status: 400 }
      );
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { message: "Competition date is invalid." },
        { status: 400 }
      );
    }

    const competition = await db.orm.public.Competition.create({
      name,
      venueName,
      date: parsedDate.toISOString(),
      description: description || null,
      status: "DRAFT",
      organizerId: user.id,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        message: "Competition created successfully.",
        competition: {
          id: competition.id,
          name: competition.name,
          venueName: competition.venueName,
          date: competition.date,
          description: competition.description,
          status: competition.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("CREATE COMPETITION ERROR:", error);

    return NextResponse.json(
      { message: "Unable to create competition." },
      { status: 500 }
    );
  }
}