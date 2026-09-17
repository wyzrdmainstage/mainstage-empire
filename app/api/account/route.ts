import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireUser } from "@/src/auth/require-user";

export async function PATCH(request: Request) {
  const user = await requireUser();

  const body = await request.json();

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  if (name.length > 100) {
    return NextResponse.json(
      { error: "Name cannot exceed 100 characters." },
      { status: 400 }
    );
  }

  const updatedUser =
    await db.orm.public.User.where({
      id: user.id,
    }).update({
      name,
      updatedAt: new Date().toISOString(),
    });

  if (!updatedUser) {
    return NextResponse.json(
      { error: "Unable to update your account." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      roles: user.roles,
    },
  });
}