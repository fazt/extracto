import { NextResponse } from "next/server";
import { listarRegistros } from "@/lib/registros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listarRegistros());
}
