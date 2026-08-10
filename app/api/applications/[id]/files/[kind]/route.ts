import { getBlob } from '@/lib/blob'
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { isAdminRequest } from '@/lib/download-token'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params
  if (!isAdminRequest(request, request.nextUrl.searchParams.get('token'), id, kind)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const column = kind === 'marksheet' ? 'marksheet_path' : kind === 'proof' ? 'proof_path' : null
  if (!column) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const result = await pool.query(`SELECT ${column} AS path FROM applications WHERE id = $1`, [id])
    const pathname = result.rows[0]?.path
    if (!pathname) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const blob = await getBlob(pathname, { access: 'private' })
    if (!blob) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const filename = pathname.split('/').pop() || `${kind}-${id}`
    return new NextResponse(blob.stream, { headers: { 'Content-Type': blob.contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[v0] private file delivery failed', error)
    return NextResponse.json({ error: 'ফাইলটি খোলা যায়নি' }, { status: 500 })
  }
}
